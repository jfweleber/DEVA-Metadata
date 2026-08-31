// =============================================================================
// XML IMPORT
// =============================================================================
// Reads the metadata XML a user exports from ArcGIS Pro and pre-fills as much
// of the project as the file honestly supports. Three shapes show up in
// practice:
//
//   1. ArcGIS metadata format  - root <metadata> carrying <Esri> and <dataIdInfo>
//   2. FGDC CSDGM              - root <metadata> carrying <idinfo>
//   3. ISO 19139 / 19115       - root <MD_Metadata> in the gmd namespace
//
// Pro exports are usually the first, and they carry the field schema in an
// <eainfo> block. That schema is the whole reason for the upload step: rule 2
// of the standard forbids inventing attribute tables, so fields are only ever
// read from the file, never guessed.
// =============================================================================

import {
  parseXml, pick, pickAll, textAt, textOf, child, childrenNamed,
  descendants, firstDescendant
} from './xml.js';
import { clean, cleanLine, toFgdcDate } from './text.js';
import {
  createProject, createField, createSource, createProcessStep,
  classifyField, toFgdcType, normalizeIsoTopic, SYSTEM_FIELDS
} from './model.js';
import { crsByEpsg, crsByName } from './crs.js';

/**
 * Strip any HTML markup ArcGIS wrapped around a text block, preserving
 * paragraph breaks. Pro stores abstracts as styled DIV/P trees, and older
 * exports store the same markup escaped as text.
 */
export function stripMarkup(value) {
  return clean(
    String(value || '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  );
}

/**
 * Text of a node that may contain block-level markup, with paragraph breaks
 * preserved rather than run together.
 */
function richText(node) {
  if (!node) return '';
  const BLOCK = new Set(['p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4']);
  let out = '';
  const walk = (current) => {
    for (const item of current.children || []) {
      if (item.type === 'text') {
        out += item.value;
      } else {
        const isBlock = BLOCK.has(item.local.toLowerCase());
        if (isBlock) out += '\n';
        walk(item);
        if (isBlock) out += '\n';
      }
    }
  };
  walk(node);
  return stripMarkup(out);
}

function richTextAt(root, path) {
  return richText(pick(root, path));
}

/**
 * First non-empty rich-text value among candidate paths.
 */
function firstRich(root, paths) {
  for (const path of paths) {
    const value = richTextAt(root, path);
    if (value) return value;
  }
  return '';
}

/**
 * ISO codelist values are carried on a `value` attribute, with the readable
 * label in the element text. Prefer the label, fall back to the code.
 */
function codeValue(node) {
  if (!node) return '';
  const text = cleanLine(textOf(node));
  if (text) return text;
  return cleanLine(node.attrs.value || node.attrs.code || '');
}

function detectFormat(root) {
  const name = root.local.toLowerCase();
  if (name === 'md_metadata' || name === 'mi_metadata') return 'ISO 19139';
  if (child(root, 'Esri') || child(root, 'dataIdInfo') || child(root, 'mdFileID')) return 'ArcGIS metadata';
  if (child(root, 'idinfo')) return 'FGDC CSDGM';
  return 'Unknown';
}

// -----------------------------------------------------------------------------
// Attribute schema
// -----------------------------------------------------------------------------

/**
 * Read every <attr> in the first populated <eainfo><detailed> block.
 * Enumerated, range and free-text domains are all carried across when present.
 */
function readFields(root) {
  const detailedBlocks = descendants(root, 'detailed');
  const fields = [];
  let entityName = '';
  let entityDescription = '';
  let entityDescriptionSource = '';

  for (const detailed of detailedBlocks) {
    const attrs = childrenNamed(detailed, 'attr');
    if (!attrs.length) continue;

    if (!entityName) {
      entityName = cleanLine(textAt(detailed, 'enttyp/enttypl')) || cleanLine(detailed.attrs.Name || '');
      entityDescription = richTextAt(detailed, 'enttyp/enttypd');
      entityDescriptionSource = cleanLine(textAt(detailed, 'enttyp/enttypds'));
    }

    for (const attr of attrs) {
      const name = cleanLine(textAt(attr, 'attrlabl'));
      if (!name) continue;
      if (fields.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) continue;

      const rawType = cleanLine(textAt(attr, 'attrtype'));
      const type = toFgdcType(rawType);
      const role = classifyField(name);

      // Section 5.1 of the standard fixes the wording for geodatabase system
      // fields. Pro writes its own terser text ("Internal feature number."),
      // so the standard's wording wins for those fields.
      const preset = SYSTEM_FIELDS[name.toLowerCase()];
      const importedDefinition = richTextAt(attr, 'attrdef');
      const definition = preset ? preset.definition : importedDefinition;
      const importedSource = cleanLine(textAt(attr, 'attrdefs'));
      const definitionSource = /^esri$/i.test(importedSource) ? 'ESRI' : importedSource;

      // Domains: one <attrdomv> per value is the required shape, but imports
      // may arrive with several <edom> nested in a single <attrdomv>.
      const values = [];
      let rangeMin = '';
      let rangeMax = '';
      let units = '';
      let udom = '';
      for (const domain of childrenNamed(attr, 'attrdomv')) {
        for (const edom of childrenNamed(domain, 'edom')) {
          const value = cleanLine(textAt(edom, 'edomv'));
          if (!value && !textAt(edom, 'edomvd')) continue;
          values.push({
            value,
            definition: richTextAt(edom, 'edomvd'),
            source: cleanLine(textAt(edom, 'edomvds'))
          });
        }
        const rdom = child(domain, 'rdom');
        if (rdom) {
          rangeMin = cleanLine(textAt(rdom, 'rdommin'));
          rangeMax = cleanLine(textAt(rdom, 'rdommax'));
          units = cleanLine(textAt(rdom, 'attrunit'));
        }
        const free = child(domain, 'udom');
        if (free && !udom) udom = richText(free);
      }

      if (preset && !udom) udom = preset.domain;

      let domainType = 'udom';
      if (values.length) domainType = 'edom';
      else if (rangeMin !== '' || rangeMax !== '') domainType = 'rdom';

      const decimalsRaw = cleanLine(textAt(attr, 'atnumdec'));
      const widthRaw = cleanLine(textAt(attr, 'attwidth'));

      fields.push(createField({
        name,
        alias: cleanLine(textAt(attr, 'attalias')),
        type,
        width: widthRaw || undefined,
        decimals: decimalsRaw || undefined,
        definition,
        definitionSource: definitionSource || undefined,
        domainType,
        udom,
        values,
        rangeMin,
        rangeMax,
        units,
        role
      }));
    }
    if (fields.length) break;
  }

  return { fields, entityName, entityDescription, entityDescriptionSource };
}

// -----------------------------------------------------------------------------
// Lineage
// -----------------------------------------------------------------------------

function readSources(root) {
  const sources = [];
  for (const srcinfo of descendants(root, 'srcinfo')) {
    const citation = pick(srcinfo, 'srccite/citeinfo');
    const originator = citation ? pickAll(citation, 'origin').map(textOf).map(cleanLine).filter(Boolean).join('; ') : '';
    const title = citation ? cleanLine(textAt(citation, 'title')) : '';
    if (!originator && !title) continue;
    sources.push(createSource({
      originator,
      title,
      pubdate: citation ? toFgdcDate(textAt(citation, 'pubdate')) : '',
      scale: cleanLine(textAt(srcinfo, 'srcscale')),
      typesrc: cleanLine(textAt(srcinfo, 'typesrc')) || 'online',
      citationAbbrev: cleanLine(textAt(srcinfo, 'srccitea')) || title,
      contribution: richTextAt(srcinfo, 'srccontr'),
      url: citation ? cleanLine(textAt(citation, 'onlink')) : ''
    }));
  }
  return sources;
}

function readProcessSteps(root) {
  const steps = [];
  for (const procstep of descendants(root, 'procstep')) {
    const description = richTextAt(procstep, 'procdesc');
    if (!description) continue;
    steps.push(createProcessStep({
      description,
      date: toFgdcDate(textAt(procstep, 'procdate'))
    }));
  }
  // ArcGIS metadata format keeps the same information under dqInfo/dataLineage.
  for (const step of descendants(root, 'prcStep')) {
    const description = richTextAt(step, 'stepDesc');
    if (!description) continue;
    if (steps.some((existing) => existing.description === description)) continue;
    steps.push(createProcessStep({
      description,
      date: toFgdcDate(textAt(step, 'stepDateTm'))
    }));
  }
  return steps;
}

// -----------------------------------------------------------------------------
// Keywords
// -----------------------------------------------------------------------------

function readKeywords(root) {
  const theme = [];
  const place = [];
  let isoTopic = '';
  let themeThesaurus = '';

  for (const themeBlock of descendants(root, 'theme')) {
    const thesaurus = cleanLine(textAt(themeBlock, 'themekt'));
    const keys = childrenNamed(themeBlock, 'themekey').map(textOf).map(cleanLine).filter(Boolean);
    if (/iso\s*19115|topic\s*categor/i.test(thesaurus)) {
      if (!isoTopic && keys.length) isoTopic = keys[0];
      continue;
    }
    if (thesaurus && !themeThesaurus && !/^none$/i.test(thesaurus)) themeThesaurus = thesaurus;
    theme.push(...keys);
  }
  for (const placeBlock of descendants(root, 'place')) {
    place.push(...childrenNamed(placeBlock, 'placekey').map(textOf).map(cleanLine).filter(Boolean));
  }

  // ArcGIS metadata format keyword containers.
  for (const container of ['searchKeys', 'themeKeys', 'descKeys']) {
    for (const block of descendants(root, container)) {
      theme.push(...descendants(block, 'keyword').map(textOf).map(cleanLine).filter(Boolean));
    }
  }
  for (const block of descendants(root, 'placeKeys')) {
    place.push(...descendants(block, 'keyword').map(textOf).map(cleanLine).filter(Boolean));
  }
  if (!isoTopic) {
    const topic = firstDescendant(root, 'TopicCatCd') || firstDescendant(root, 'tpCat');
    if (topic) isoTopic = codeValue(topic).toLowerCase();
  }

  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key) || !item) return false;
      seen.add(key);
      return true;
    });
  };

  return {
    theme: dedupe(theme),
    place: dedupe(place),
    isoTopic: cleanLine(isoTopic),
    themeThesaurus
  };
}

// -----------------------------------------------------------------------------
// Spatial
// -----------------------------------------------------------------------------

function readBounding(root) {
  const fgdc = firstDescendant(root, 'bounding');
  if (fgdc) {
    const box = {
      westbc: cleanLine(textAt(fgdc, 'westbc')),
      eastbc: cleanLine(textAt(fgdc, 'eastbc')),
      northbc: cleanLine(textAt(fgdc, 'northbc')),
      southbc: cleanLine(textAt(fgdc, 'southbc'))
    };
    if (box.westbc && box.eastbc) return box;
  }
  const iso = firstDescendant(root, 'GeoBndBox') || firstDescendant(root, 'EX_GeographicBoundingBox');
  if (iso) {
    return {
      westbc: cleanLine(textAt(iso, 'westBL') || textAt(iso, 'westBoundLongitude')),
      eastbc: cleanLine(textAt(iso, 'eastBL') || textAt(iso, 'eastBoundLongitude')),
      northbc: cleanLine(textAt(iso, 'northBL') || textAt(iso, 'northBoundLatitude')),
      southbc: cleanLine(textAt(iso, 'southBL') || textAt(iso, 'southBoundLatitude'))
    };
  }
  return { westbc: '', eastbc: '', northbc: '', southbc: '' };
}

const GEOMETRY_LABELS = {
  polygon: 'Polygon',
  'g-polygon': 'Polygon',
  polyline: 'Polyline',
  line: 'Polyline',
  string: 'Polyline',
  'complete chain': 'Polyline',
  point: 'Point',
  'entity point': 'Point',
  multipoint: 'Multipoint',
  curve: 'Polyline',
  surface: 'Polygon'
};

function readSpatialOrganization(root) {
  const direct = cleanLine(textAt(root, 'spdoinfo/direct'));
  const esriterm = firstDescendant(root, 'esriterm');
  const geometryRaw = esriterm
    ? cleanLine(textOf(child(esriterm, 'efeageom') || {}))
    : cleanLine(textAt(root, 'spdoinfo/ptvctinf/sdtsterm/sdtstype'));
  const isoGeom = !geometryRaw ? codeValue(firstDescendant(root, 'geoObjTyp')) : '';
  const geometryKey = (geometryRaw || isoGeom).toLowerCase();

  let count = esriterm ? cleanLine(textAt(esriterm, 'efeacnt')) : '';
  if (!count) count = cleanLine(textAt(root, 'spdoinfo/ptvctinf/sdtsterm/ptvctcnt'));
  if (!count) {
    const isoCount = firstDescendant(root, 'geoObjCnt');
    if (isoCount) count = cleanLine(textOf(isoCount));
  }

  const raster = firstDescendant(root, 'rastinfo');
  return {
    dataType: /raster|grid/i.test(direct) || raster ? 'Raster' : 'Vector',
    geometryType: GEOMETRY_LABELS[geometryKey] || cleanLine(geometryRaw || isoGeom),
    featureCount: /^\d+$/.test(count) ? count : '',
    rasterRowCount: raster ? cleanLine(textAt(raster, 'rowcount')) : '',
    rasterColumnCount: raster ? cleanLine(textAt(raster, 'colcount')) : ''
  };
}

/**
 * Find the coordinate system. ArcGIS records it several different ways
 * depending on export path, so try EPSG codes first and names second.
 */
function readCrs(root) {
  const codes = [];
  for (const node of descendants(root, 'identCode')) {
    const code = cleanLine(node.attrs.code || textOf(node));
    if (/^\d{4,6}$/.test(code)) codes.push(code);
  }
  for (const tag of ['projcslookup', 'geogcslookup']) {
    for (const node of descendants(root, tag)) {
      const code = cleanLine(textOf(node));
      if (/^\d{4,6}$/.test(code)) codes.push(code);
    }
  }
  let unregisteredCode = '';
  for (const code of codes) {
    const match = crsByEpsg(code);
    if (match) return { crs: match, epsg: code, source: `EPSG code ${code} in the uploaded file` };
    // An unregistered but valid-looking EPSG code is still worth reporting so
    // the user can confirm it instead of retyping the whole definition.
    if (!unregisteredCode) unregisteredCode = code;
  }

  const names = [
    cleanLine(textAt(root, 'spref/horizsys/cordsysn/projcsn')),
    cleanLine(textAt(root, 'spref/horizsys/cordsysn/geogcsn'))
  ].filter(Boolean);
  for (const node of descendants(root, 'refSysID')) {
    const identifier = cleanLine(textAt(node, 'identCode') || textAt(node, 'code'));
    if (identifier && !/^\d+$/.test(identifier)) names.push(identifier);
  }
  const peXml = firstDescendant(root, 'peXml');
  if (peXml) {
    const wkt = textOf(peXml);
    const projName = /PROJCS\s*\[\s*"([^"]+)"/.exec(wkt) || /GEOGCS\s*\[\s*"([^"]+)"/.exec(wkt);
    if (projName) names.push(projName[1]);
  }
  for (const name of names) {
    const match = crsByName(name);
    if (match) return { crs: match, epsg: match.epsg, source: `coordinate system name "${name}"` };
  }
  if (names.length) return { crs: null, epsg: '', name: names[0], source: `coordinate system name "${names[0]}"` };
  if (unregisteredCode) return { crs: null, epsg: unregisteredCode, source: `EPSG code ${unregisteredCode}` };
  return { crs: null, epsg: '', source: '' };
}

// -----------------------------------------------------------------------------
// Top level
// -----------------------------------------------------------------------------

/**
 * Parse an XML string into a project plus a summary of what was and was not
 * found. `base` supplies the defaults an empty project starts from.
 */
export function importMetadataXml(xmlText, base = createProject()) {
  const root = parseXml(xmlText);
  const format = detectFormat(root);
  const project = { ...base };
  const found = [];
  const missing = [];

  const record = (label, value, target) => {
    if (value !== '' && value !== undefined && value !== null) {
      project[target] = value;
      found.push(label);
      return true;
    }
    missing.push(label);
    return false;
  };

  // --- Citation and description ---------------------------------------------
  const title = cleanLine(firstRich(root, [
    'idinfo/citation/citeinfo/title',
    'dataIdInfo/idCitation/resTitle',
    'identificationInfo/MD_DataIdentification/citation/CI_Citation/title/CharacterString'
  ]));
  record('Title', title, 'title');

  const originators = pickAll(root, 'idinfo/citation/citeinfo/origin')
    .map(textOf).map(cleanLine).filter(Boolean);
  if (originators.length) {
    project.originators = originators;
    found.push('Originator');
  }

  const pubdate = toFgdcDate(firstRich(root, [
    'idinfo/citation/citeinfo/pubdate',
    'dataIdInfo/idCitation/date/pubDate'
  ]));
  if (pubdate) {
    project.pubdate = pubdate;
    found.push('Publication date');
  }

  const edition = cleanLine(firstRich(root, ['idinfo/citation/citeinfo/edition', 'dataIdInfo/idCitation/resEd']));
  if (edition) project.edition = edition;

  const geoform = cleanLine(firstRich(root, ['idinfo/citation/citeinfo/geoform', 'dataIdInfo/idCitation/presForm/PresFormCd']));
  if (geoform) project.geoform = geoform;

  record('Abstract', firstRich(root, [
    'idinfo/descript/abstract',
    'dataIdInfo/idAbs',
    'identificationInfo/MD_DataIdentification/abstract/CharacterString'
  ]), 'abstract');

  record('Purpose', firstRich(root, [
    'idinfo/descript/purpose',
    'dataIdInfo/idPurp',
    'identificationInfo/MD_DataIdentification/purpose/CharacterString'
  ]), 'purpose');

  const supplemental = firstRich(root, ['idinfo/descript/supplinf', 'dataIdInfo/suppInfo']);
  if (supplemental) project.supplemental = supplemental;

  // --- Time period ----------------------------------------------------------
  const caldate = toFgdcDate(textAt(root, 'idinfo/timeperd/timeinfo/sngdate/caldate'));
  const begdate = toFgdcDate(textAt(root, 'idinfo/timeperd/timeinfo/rngdates/begdate'));
  const enddate = toFgdcDate(textAt(root, 'idinfo/timeperd/timeinfo/rngdates/enddate'));
  if (begdate || enddate) {
    project.timePeriodType = 'range';
    project.beginDate = begdate;
    project.endDate = enddate;
    found.push('Time period');
  } else if (caldate) {
    project.timePeriodType = 'single';
    project.calendarDate = caldate;
    found.push('Time period');
  }
  const currentness = cleanLine(textAt(root, 'idinfo/timeperd/current'));
  if (currentness) project.currentness = currentness;

  // --- Status ---------------------------------------------------------------
  const progress = cleanLine(textAt(root, 'idinfo/status/progress'))
    || codeValue(firstDescendant(root, 'ProgCd'));
  if (progress) project.progress = /complete/i.test(progress) ? 'Complete' : cleanLine(progress);
  const update = cleanLine(textAt(root, 'idinfo/status/update'))
    || codeValue(firstDescendant(root, 'MaintFreqCd'));
  if (update) project.updateFrequency = update;

  // --- Bounding box ---------------------------------------------------------
  const box = readBounding(root);
  if (box.westbc && box.eastbc && box.northbc && box.southbc) {
    Object.assign(project, box);
    found.push('Bounding coordinates');
  } else {
    missing.push('Bounding coordinates');
  }

  // --- Keywords -------------------------------------------------------------
  const keywords = readKeywords(root);
  if (keywords.theme.length) {
    project.themeKeywords = keywords.theme;
    found.push('Theme keywords');
  } else {
    missing.push('Theme keywords');
  }
  if (keywords.place.length) project.placeKeywords = keywords.place;
  if (keywords.isoTopic) {
    project.isoTopicCategory = normalizeIsoTopic(keywords.isoTopic);
    found.push('ISO topic category');
  } else {
    missing.push('ISO topic category');
  }
  if (keywords.themeThesaurus) project.themeKeywordThesaurus = keywords.themeThesaurus;

  // --- Constraints ----------------------------------------------------------
  const accconst = cleanLine(firstRich(root, ['idinfo/accconst', 'dataIdInfo/resConst/LegConsts/othConsts']));
  if (accconst && !/^none$/i.test(accconst)) project.accessConstraints = accconst;
  // useConstraints is deliberately not imported. Section 2.6 requires the NPS
  // disclaimer verbatim, so whatever the source file said is replaced.

  // --- Credits --------------------------------------------------------------
  const credits = cleanLine(firstRich(root, ['idinfo/datacred', 'dataIdInfo/idCredit']));
  if (credits) project.contact = { ...project.contact, credits };

  // --- Data quality and lineage ---------------------------------------------
  const sources = readSources(root);
  if (sources.length) {
    project.sources = sources;
    found.push(`Lineage sources (${sources.length})`);
  } else {
    missing.push('Lineage sources');
  }
  const steps = readProcessSteps(root);
  if (steps.length) {
    project.processSteps = steps;
    found.push(`Process steps (${steps.length})`);
  } else {
    missing.push('Process steps');
  }
  const logical = richTextAt(root, 'dataqual/logic');
  if (logical) project.logicalConsistency = logical;
  const complete = richTextAt(root, 'dataqual/complete');
  if (complete) project.completeness = complete;
  const attracc = richTextAt(root, 'dataqual/attracc/attraccr');
  if (attracc) project.attributeAccuracy = attracc;
  const posacc = richTextAt(root, 'dataqual/posacc/horizpa/horizpar');
  if (posacc) project.positionalAccuracy = posacc;

  // --- Spatial organization -------------------------------------------------
  const spatial = readSpatialOrganization(root);
  project.dataType = spatial.dataType;
  if (spatial.geometryType) {
    project.geometryType = spatial.geometryType;
    found.push('Geometry type');
  } else {
    missing.push('Geometry type');
  }
  if (spatial.featureCount) {
    project.featureCount = spatial.featureCount;
    found.push('Feature count');
  } else {
    missing.push('Feature count');
  }
  if (spatial.rasterRowCount) project.rasterRowCount = spatial.rasterRowCount;
  if (spatial.rasterColumnCount) project.rasterColumnCount = spatial.rasterColumnCount;

  // --- Coordinate system ----------------------------------------------------
  const crsResult = readCrs(root);
  if (crsResult.crs) {
    // The file describes the source dataset, which is the analysis CRS.
    project.analysisCrsEpsg = crsResult.crs.epsg;
    found.push(`Coordinate system (${crsResult.crs.label})`);
  } else if (crsResult.epsg || crsResult.name) {
    project.customCrs = {
      ...project.customCrs,
      epsg: crsResult.epsg || '',
      label: crsResult.name || `EPSG ${crsResult.epsg}`
    };
    missing.push('Coordinate system (found in file but not recognized, please confirm)');
  } else {
    missing.push('Coordinate system');
  }

  // --- Entity and attributes ------------------------------------------------
  const schema = readFields(root);
  if (schema.fields.length) {
    project.fields = schema.fields;
    found.push(`Field schema (${schema.fields.length} fields)`);
  } else {
    missing.push('Field schema');
  }
  project.entityName = schema.entityName || cleanLine(title);
  if (schema.entityDescription) project.entityDescription = schema.entityDescription;
  if (schema.entityDescriptionSource) project.entityDescriptionSource = schema.entityDescriptionSource;
  project.editorTrackingPresent = schema.fields.some((field) => field.role === 'editor');

  // --- Distribution ---------------------------------------------------------
  const onlink = cleanLine(firstRich(root, ['idinfo/citation/citeinfo/onlink']))
    || cleanLine(textAt(root, 'distinfo/stdorder/digform/digtopt/onlinopt/computer/networka/networkr'))
    || cleanLine(textAt(root, 'distInfo/distTranOps/onLineSrc/linkage'));
  if (onlink) {
    project.distributionUrl = onlink;
    project.onlink = onlink;
  }
  const formname = cleanLine(textAt(root, 'distinfo/stdorder/digform/digtinfo/formname'));
  if (formname) project.distributionFormat = formname;

  // --- Metadata record ------------------------------------------------------
  const metd = toFgdcDate(textAt(root, 'metainfo/metd') || textAt(root, 'mdDateSt'));
  if (metd) project.metadataDate = metd;

  const fieldRoles = {
    user: schema.fields.filter((f) => f.role === 'user').length,
    system: schema.fields.filter((f) => f.role === 'system').length,
    editor: schema.fields.filter((f) => f.role === 'editor').length
  };

  project.importSummary = {
    format,
    rootElement: root.name,
    found,
    missing,
    fieldCount: schema.fields.length,
    fieldRoles,
    crsSource: crsResult.source || '',
    fieldsMissingDefinition: schema.fields.filter((f) => f.role === 'user' && !f.definition).map((f) => f.name)
  };

  return project;
}

export { detectFormat, readFields, readCrs, readSpatialOrganization, readKeywords };
