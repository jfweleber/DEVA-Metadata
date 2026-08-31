// =============================================================================
// FGDC-STD-001-1998 XML GENERATION
// =============================================================================
// Builds the authoritative metadata record from the project model. Element
// order follows the CSDGM production rules, because order is part of validity:
// a record with the right elements in the wrong sequence fails schema checks.
//
// Attribute blocks follow the worked example in Section 2.7 of the DEVA
// standard: attrlabl, attalias, attrtype, attwidth, atnumdec, attrdef,
// attrdefs, then one attrdomv per enumerated value.
// =============================================================================

import { buildDocument } from './xml.js';
import { clean, cleanLine, toFgdcDate, splitList } from './text.js';
import {
  NPS_USE_CONSTRAINTS, METADATA_STANDARD_NAME, METADATA_STANDARD_VERSION,
  typeTakesDecimals, normalizeIsoTopic
} from './model.js';
import { buildSpref, resolveCrs, crsByEpsg, crsDisplay } from './crs.js';

/**
 * SDTS terms are a controlled vocabulary in FGDC. ArcGIS geometry names are not.
 */
const SDTS_TYPES = {
  polygon: 'G-polygon',
  polyline: 'String',
  line: 'String',
  point: 'Entity point',
  multipoint: 'Point',
  annotation: 'Label point'
};

export function sdtsType(geometryType) {
  const key = String(geometryType || '').toLowerCase();
  return SDTS_TYPES[key] || cleanLine(geometryType) || 'G-polygon';
}

/**
 * Which coordinate system the <spref> block documents. The standard hosts
 * services in Web Mercator while the source geodatabase stays in UTM 11N, so
 * the record has to be explicit about which one it is describing.
 */
export function documentedCrsFor(project) {
  const epsg = project.documentedCrs === 'analysis' ? project.analysisCrsEpsg : project.serviceCrsEpsg;
  const registered = crsByEpsg(epsg);
  if (registered) return registered;
  return resolveCrs({ ...project.customCrs, epsg: epsg || project.customCrs.epsg });
}

/**
 * Section 2.3 CRS note, appended to the final process step when the analysis
 * and service coordinate systems differ.
 */
export function crsNoteFor(project) {
  const analysis = crsByEpsg(project.analysisCrsEpsg) || resolveCrs(project.customCrs);
  const service = crsByEpsg(project.serviceCrsEpsg) || resolveCrs({ epsg: project.serviceCrsEpsg });
  if (!analysis || !service) return '';
  // Nothing to say when both ends are the same system, or when neither has been
  // described well enough to name.
  const sameCode = analysis.epsg && service.epsg && analysis.epsg === service.epsg;
  const sameLabel = cleanLine(analysis.label) === cleanLine(service.label);
  if (sameCode || sameLabel) return '';
  if (!cleanLine(analysis.label) || !cleanLine(service.label)) return '';

  // A custom system may have no EPSG code, so the code is only stated when known.
  const withCode = (crs) => (crs.epsg ? `${crs.label} (EPSG ${crs.epsg})` : crs.label);
  return `Analysis CRS: ${withCode(analysis)}. Layer published to ArcGIS Portal in ${withCode(service)} per Portal hosting requirements; source geodatabase retains ${analysis.label}.`;
}

/**
 * The process steps as they will appear in the record, with the CRS note
 * folded into the last one. Shared with the HTML generator so both artifacts
 * tell the same story.
 */
export function resolvedProcessSteps(project) {
  const steps = (project.processSteps || [])
    .filter((step) => clean(step.description))
    .map((step) => ({
      description: clean(step.description),
      date: toFgdcDate(step.date) || toFgdcDate(project.pubdate)
    }));

  const note = project.appendCrsNote ? crsNoteFor(project) : '';
  if (!note) return steps;

  if (!steps.length) {
    return [{ description: note, date: toFgdcDate(project.pubdate) }];
  }
  const last = steps[steps.length - 1];
  if (!last.description.includes('per Portal hosting requirements')) {
    last.description = `${last.description} ${note}`.trim();
  }
  return steps;
}

/**
 * FGDC contact block, used for both the point of contact and the metadata
 * contact.
 */
function contactSpec(contact) {
  const person = cleanLine(contact.person);
  const organization = cleanLine(contact.organization);
  const primary = person
    ? ['cntperp', [['cntper', person], ['cntorg', organization]]]
    : ['cntorgp', [['cntorg', organization]]];

  return ['cntinfo', [
    primary,
    ['cntpos', cleanLine(contact.position)],
    ['cntaddr', [
      ['addrtype', 'mailing and physical address'],
      ['address', cleanLine(contact.address)],
      ['city', cleanLine(contact.city)],
      ['state', cleanLine(contact.state)],
      ['postal', cleanLine(contact.postal)],
      ['country', cleanLine(contact.country) || 'USA']
    ]],
    ['cntvoice', cleanLine(contact.phone)],
    contact.email ? ['cntemail', cleanLine(contact.email)] : null
  ].filter(Boolean)];
}

function timePeriodSpec(project) {
  if (project.timePeriodType === 'range') {
    return ['timeinfo', [
      ['rngdates', [
        ['begdate', toFgdcDate(project.beginDate)],
        ['enddate', toFgdcDate(project.endDate)]
      ]]
    ]];
  }
  return ['timeinfo', [
    ['sngdate', [['caldate', toFgdcDate(project.calendarDate) || toFgdcDate(project.pubdate)]]]
  ]];
}

function keywordsSpec(project) {
  const themeKeys = (project.themeKeywords || []).map(cleanLine).filter(Boolean);
  const placeKeys = (project.placeKeywords || []).map(cleanLine).filter(Boolean);
  const isoTopic = normalizeIsoTopic(project.isoTopicCategory);

  const blocks = [];
  blocks.push(['theme', [
    ['themekt', cleanLine(project.themeKeywordThesaurus) || 'None'],
    ...themeKeys.map((key) => ['themekey', key])
  ]]);
  if (isoTopic) {
    // The ISO topic category rides in its own theme block, which is how ESRI
    // and NPS records carry it inside CSDGM.
    blocks.push(['theme', [
      ['themekt', 'ISO 19115 Topic Category'],
      ['themekey', isoTopic]
    ]]);
  }
  if (placeKeys.length) {
    blocks.push(['place', [
      ['placekt', cleanLine(project.placeKeywordThesaurus) || 'None',],
      ...placeKeys.map((key) => ['placekey', key])
    ]]);
  }
  return ['keywords', blocks];
}

function sourceSpec(source) {
  const citation = [
    ...splitList(source.originator).map((origin) => ['origin', origin]),
    ['pubdate', toFgdcDate(source.pubdate) || 'Unknown'],
    ['title', cleanLine(source.title)],
    source.url ? ['onlink', cleanLine(source.url)] : null
  ].filter(Boolean);

  return ['srcinfo', [
    ['srccite', [['citeinfo', citation]]],
    source.scale ? ['srcscale', cleanLine(source.scale)] : null,
    ['typesrc', cleanLine(source.typesrc) || 'online'],
    ['srctime', [
      ['timeinfo', [['sngdate', [['caldate', toFgdcDate(source.pubdate) || 'Unknown']]]]],
      ['srccurr', 'publication date']
    ]],
    ['srccitea', cleanLine(source.citationAbbrev) || cleanLine(source.title)],
    ['srccontr', clean(source.contribution) || 'Source data used in the analysis.']
  ].filter(Boolean)];
}

function lineageSpec(project) {
  const sources = (project.sources || [])
    .filter((source) => cleanLine(source.title) || cleanLine(source.originator))
    .map(sourceSpec);

  const steps = resolvedProcessSteps(project).map((step) => ['procstep', [
    ['procdesc', step.description],
    ['procdate', step.date || toFgdcDate(project.pubdate)]
  ]]);

  return ['lineage', [...sources, ...steps]];
}

function spatialOrganizationSpec(project) {
  if (project.dataType === 'Raster') {
    return ['spdoinfo', [
      ['direct', 'Raster'],
      ['rastinfo', [
        ['rasttype', 'Grid Cell'],
        project.rasterRowCount ? ['rowcount', cleanLine(project.rasterRowCount)] : null,
        project.rasterColumnCount ? ['colcount', cleanLine(project.rasterColumnCount)] : null
      ].filter(Boolean)]
    ]];
  }
  const count = String(project.featureCount || '').replace(/[^0-9]/g, '');
  return ['spdoinfo', [
    ['direct', 'Vector'],
    ['ptvctinf', [
      ['sdtsterm', [
        ['sdtstype', sdtsType(project.geometryType)],
        count ? ['ptvctcnt', count] : null
      ].filter(Boolean)]
    ]]
  ]];
}

/**
 * One <attr> block. Enumerated values each get their own <attrdomv><edom>,
 * never nested, per Section 2.5 of the standard.
 */
function attributeSpec(field) {
  const type = cleanLine(field.type) || 'String';
  const domainBlocks = [];

  if (field.domainType === 'edom') {
    for (const entry of field.values || []) {
      const value = cleanLine(entry.value);
      if (!value && !clean(entry.definition)) continue;
      domainBlocks.push(['attrdomv', [
        ['edom', [
          ['edomv', value],
          ['edomvd', clean(entry.definition) || 'No definition supplied.'],
          ['edomvds', cleanLine(entry.source) || cleanLine(field.definitionSource) || 'Death Valley National Park']
        ]]
      ]]);
    }
  } else if (field.domainType === 'rdom') {
    domainBlocks.push(['attrdomv', [
      ['rdom', [
        ['rdommin', cleanLine(field.rangeMin)],
        ['rdommax', cleanLine(field.rangeMax)],
        field.units ? ['attrunit', cleanLine(field.units)] : null
      ].filter(Boolean)]
    ]]);
  }

  if (!domainBlocks.length) {
    domainBlocks.push(['attrdomv', [
      ['udom', clean(field.udom) || 'Values are not enumerated.']
    ]]);
  }

  return ['attr', [
    ['attrlabl', cleanLine(field.name)],
    ['attalias', cleanLine(field.alias) || cleanLine(field.name)],
    ['attrtype', type],
    ['attwidth', cleanLine(field.width)],
    // atnumdec belongs on numeric types only (Section 2.4).
    typeTakesDecimals(type) && field.decimals !== '' ? ['atnumdec', cleanLine(field.decimals)] : null,
    ['attrdef', clean(field.definition) || 'Definition not supplied.'],
    ['attrdefs', cleanLine(field.definitionSource) || 'Death Valley National Park'],
    ...domainBlocks
  ].filter(Boolean)];
}

function entityAttributeSpec(project) {
  const fields = (project.fields || []).filter((field) => field.includeInXml);
  if (!fields.length) return null;
  return ['eainfo', [
    ['detailed', [
      ['enttyp', [
        ['enttypl', cleanLine(project.entityName) || cleanLine(project.title)],
        ['enttypd', clean(project.entityDescription) || clean(project.abstract)],
        ['enttypds', cleanLine(project.entityDescriptionSource) || 'Death Valley National Park']
      ]],
      ...fields.map(attributeSpec)
    ]]
  ]];
}

function distributionSpec(project) {
  const url = cleanLine(project.distributionUrl);
  return ['distinfo', [
    ['distrib', [contactSpec(project.contact)]],
    ['resdesc', cleanLine(project.entityName) || cleanLine(project.title)],
    ['distliab', NPS_USE_CONSTRAINTS],
    ['stdorder', [
      ['digform', [
        ['digtinfo', [
          ['formname', cleanLine(project.distributionFormat) || 'ArcGIS Hosted Feature Layer']
        ]],
        url ? ['digtopt', [
          ['onlinopt', [
            ['computer', [
              ['networka', [
                ['networkr', url]
              ]]
            ]]
          ]]
        ]] : null
      ].filter(Boolean)],
      ['fees', cleanLine(project.distributionFees) || 'None']
    ]]
  ]];
}

/**
 * Build the complete FGDC record as an indented XML string.
 */
export function generateFgdcXml(project) {
  const citation = [
    ...(project.originators || []).map(cleanLine).filter(Boolean).map((origin) => ['origin', origin]),
    ['pubdate', toFgdcDate(project.pubdate)],
    ['title', cleanLine(project.title)],
    project.edition ? ['edition', cleanLine(project.edition)] : null,
    ['geoform', cleanLine(project.geoform) || 'vector digital data'],
    ['pubinfo', [
      ['pubplace', `${cleanLine(project.contact.city)}, ${cleanLine(project.contact.state)}`],
      ['publish', cleanLine(project.contact.organization)]
    ]],
    project.onlink ? ['onlink', cleanLine(project.onlink)] : null
  ].filter(Boolean);

  const idinfo = ['idinfo', [
    ['citation', [['citeinfo', citation]]],
    ['descript', [
      ['abstract', clean(project.abstract)],
      ['purpose', clean(project.purpose)],
      project.supplemental ? ['supplinf', clean(project.supplemental)] : null
    ].filter(Boolean)],
    ['timeperd', [
      timePeriodSpec(project),
      ['current', cleanLine(project.currentness) || 'publication date']
    ]],
    ['status', [
      ['progress', cleanLine(project.progress) || 'Complete'],
      ['update', cleanLine(project.updateFrequency) || 'As needed']
    ]],
    ['spdom', [
      ['bounding', [
        ['westbc', cleanLine(project.westbc)],
        ['eastbc', cleanLine(project.eastbc)],
        ['northbc', cleanLine(project.northbc)],
        ['southbc', cleanLine(project.southbc)]
      ]]
    ]],
    keywordsSpec(project),
    ['accconst', clean(project.accessConstraints) || 'None'],
    // Section 2.6: verbatim, always.
    ['useconst', NPS_USE_CONSTRAINTS],
    ['ptcontac', [contactSpec(project.contact)]],
    project.contact.credits ? ['datacred', clean(project.contact.credits)] : null
  ].filter(Boolean)];

  const dataqual = ['dataqual', [
    project.attributeAccuracy
      ? ['attracc', [['attraccr', clean(project.attributeAccuracy)]]]
      : null,
    ['logic', clean(project.logicalConsistency)],
    ['complete', clean(project.completeness)],
    project.positionalAccuracy
      ? ['posacc', [['horizpa', [['horizpar', clean(project.positionalAccuracy)]]]]]
      : null,
    lineageSpec(project)
  ].filter(Boolean)];

  const metainfo = ['metainfo', [
    ['metd', toFgdcDate(project.metadataDate)],
    ['metc', [contactSpec(project.contact)]],
    ['metstdn', METADATA_STANDARD_NAME],
    ['metstdv', METADATA_STANDARD_VERSION],
    ['mettc', 'local time']
  ]];

  const document = ['metadata', [
    idinfo,
    dataqual,
    spatialOrganizationSpec(project),
    buildSpref(documentedCrsFor(project)),
    entityAttributeSpec(project),
    distributionSpec(project),
    metainfo
  ].filter(Boolean)];

  return buildDocument(document);
}

export { crsDisplay };
