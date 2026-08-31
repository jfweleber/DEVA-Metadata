// =============================================================================
// ARCGIS XML WORKSPACE DOCUMENT
// =============================================================================
// The other thing staff export from ArcGIS, and usually the more useful one:
// Catalog pane, right-click a geodatabase or feature class, Export, XML
// Workspace Document. It describes the real schema whether or not anyone ever
// wrote metadata, which is the common case here.
//
// What it gives us that a metadata export does not:
//
//   - the field list as the geodatabase actually holds it, always present
//   - coded value and range domains, which map straight onto FGDC edom and rdom
//   - geometry type, spatial reference and extent in native coordinates
//   - which fields are editor tracking fields, declared rather than guessed
//   - the data itself, when exported with data, giving a true feature count
//     and observed value ranges instead of estimates
//
// A workspace can hold many datasets, so the caller picks one and this module
// turns it into a project. Any metadata embedded in the chosen dataset is
// handed back for the metadata importer to read, so an export that does carry
// metadata loses nothing.
// =============================================================================

import { parseXml, child, childrenNamed, descendants, textAt, textOf, pick } from './xml.js';
import { clean, cleanLine, humanizeFieldName } from './text.js';
import { createField, createProject, toFgdcType, typeTakesDecimals, defaultWidth } from './model.js';
import { crsByEpsg, crsByName, extentToBoundingBox, crsDisplay } from './crs.js';

/**
 * True when the text looks like an XML Workspace Document. Checked on a leading
 * slice of the file so a large export does not have to be read to decide.
 */
export function looksLikeWorkspace(text) {
  const head = String(text).slice(0, 4000);
  return /<(\w+:)?Workspace[\s>]/.test(head) || /WorkspaceDefinition/.test(head);
}

/**
 * The xsi:type attribute, which is how the format distinguishes a feature class
 * from a table and a coded value domain from a range domain.
 */
function xsiType(node) {
  if (!node) return '';
  for (const [key, value] of Object.entries(node.attrs || {})) {
    if (key.toLowerCase().endsWith('type') && key.toLowerCase().includes('xsi')) {
      return String(value).replace(/^.*:/, '');
    }
  }
  return '';
}

const GEOMETRY_LABELS = {
  esrigeometrypolygon: 'Polygon',
  esrigeometrypolyline: 'Polyline',
  esrigeometrypoint: 'Point',
  esrigeometrymultipoint: 'Multipoint',
  esrigeometrymultipatch: 'Multipatch'
};

function geometryLabel(value) {
  return GEOMETRY_LABELS[String(value || '').toLowerCase()] || cleanLine(value);
}

// -----------------------------------------------------------------------------
// Domains
// -----------------------------------------------------------------------------

/**
 * Read a Domain element into a shape the field builder can use.
 * Coded value domains become FGDC enumerated domains, range domains become
 * range domains. Everything else is left for the user to describe.
 */
function readDomain(node) {
  if (!node) return null;
  const type = xsiType(node);
  const name = cleanLine(textAt(node, 'DomainName'));
  const description = clean(textAt(node, 'Description'));

  if (/CodedValueDomain/i.test(type)) {
    const values = [];
    for (const coded of descendants(node, 'CodedValue')) {
      const label = cleanLine(textAt(coded, 'Name'));
      const code = cleanLine(textAt(coded, 'Code'));
      if (!label && !code) continue;
      values.push({
        // The stored value is the code; the name is what it means.
        value: code || label,
        definition: label && code && label !== code ? label : '',
        source: 'Death Valley National Park'
      });
    }
    return { kind: 'coded', name, description, values };
  }

  if (/RangeDomain/i.test(type)) {
    return {
      kind: 'range',
      name,
      description,
      min: cleanLine(textAt(node, 'MinValue')),
      max: cleanLine(textAt(node, 'MaxValue'))
    };
  }

  return { kind: 'other', name, description };
}

/**
 * Workspace-level domains, keyed by name, so a field that references one by
 * name can find it.
 */
function readWorkspaceDomains(definition) {
  const domains = new Map();
  const container = child(definition, 'Domains');
  for (const node of childrenNamed(container, 'Domain')) {
    const domain = readDomain(node);
    if (domain && domain.name) domains.set(domain.name.toLowerCase(), domain);
  }
  return domains;
}

// -----------------------------------------------------------------------------
// Spatial reference
// -----------------------------------------------------------------------------

/**
 * Resolve a SpatialReference element to a registry entry, preferring the EPSG
 * code and falling back to the projection name inside the WKT.
 */
export function readSpatialReference(node) {
  if (!node) return { crs: null, wkid: '', wkt: '' };
  const wkid = cleanLine(textAt(node, 'LatestWKID')) || cleanLine(textAt(node, 'WKID'));
  const wkt = clean(textAt(node, 'WKT'));

  let crs = wkid ? crsByEpsg(wkid) : null;
  if (!crs && wkt) {
    const named = /PROJCS\s*\[\s*"([^"]+)"/.exec(wkt) || /GEOGCS\s*\[\s*"([^"]+)"/.exec(wkt);
    if (named) crs = crsByName(named[1]);
  }
  return { crs, wkid, wkt };
}

// -----------------------------------------------------------------------------
// Datasets
// -----------------------------------------------------------------------------

/**
 * Read one DataElement into a dataset description.
 */
function readDataset(node, workspaceDomains) {
  const type = xsiType(node);
  const isFeatureClass = /DEFeatureClass/i.test(type);
  const isTable = /DETable/i.test(type);
  if (!isFeatureClass && !isTable) return null;

  const name = cleanLine(textAt(node, 'Name'));
  if (!name) return null;

  // Editor tracking is declared, so those fields never have to be guessed from
  // their names.
  const trackingEnabled = /true/i.test(textAt(node, 'EditorTrackingEnabled'));
  const trackingFields = new Set([
    textAt(node, 'CreatorFieldName'),
    textAt(node, 'CreatedAtFieldName'),
    textAt(node, 'EditorFieldName'),
    textAt(node, 'EditedAtFieldName')
  ].map((value) => cleanLine(value).toLowerCase()).filter(Boolean));

  const oidField = cleanLine(textAt(node, 'OIDFieldName')).toLowerCase();
  const shapeField = cleanLine(textAt(node, 'ShapeFieldName')).toLowerCase();
  const areaField = cleanLine(textAt(node, 'AreaFieldName')).toLowerCase();
  const lengthField = cleanLine(textAt(node, 'LengthFieldName')).toLowerCase();
  const globalIdField = cleanLine(textAt(node, 'GlobalIDFieldName')).toLowerCase();
  const systemFields = new Set([oidField, shapeField, areaField, lengthField, globalIdField].filter(Boolean));

  const fields = [];
  const fieldArray = pick(node, 'Fields/FieldArray');
  for (const fieldNode of childrenNamed(fieldArray, 'Field')) {
    const fieldName = cleanLine(textAt(fieldNode, 'Name'));
    if (!fieldName) continue;
    const key = fieldName.toLowerCase();

    // The dataset declares its own domain inline, or names one from the
    // workspace-level list.
    let domain = readDomain(child(fieldNode, 'Domain'));
    if (!domain) {
      const referenced = cleanLine(textAt(fieldNode, 'DomainName')).toLowerCase();
      if (referenced && workspaceDomains.has(referenced)) domain = workspaceDomains.get(referenced);
    }

    fields.push({
      name: fieldName,
      alias: cleanLine(textAt(fieldNode, 'AliasName')),
      esriType: cleanLine(textAt(fieldNode, 'Type')),
      length: cleanLine(textAt(fieldNode, 'Length')),
      precision: cleanLine(textAt(fieldNode, 'Precision')),
      scale: cleanLine(textAt(fieldNode, 'Scale')),
      nullable: !/false/i.test(textAt(fieldNode, 'IsNullable')),
      domain,
      isEditorTracking: trackingEnabled && trackingFields.has(key),
      isSystem: systemFields.has(key),
      geometryType: geometryLabel(textAt(fieldNode, 'GeometryDef/GeometryType')),
      spatialReference: readSpatialReference(pick(fieldNode, 'GeometryDef/SpatialReference'))
    });
  }

  // Metadata is embedded as an escaped XML document when the export carried it.
  const embeddedMetadata = clean(textAt(node, 'Metadata/XmlDoc'));

  const extentNode = child(node, 'Extent');
  const extent = extentNode ? {
    xmin: cleanLine(textAt(extentNode, 'XMin')),
    ymin: cleanLine(textAt(extentNode, 'YMin')),
    xmax: cleanLine(textAt(extentNode, 'XMax')),
    ymax: cleanLine(textAt(extentNode, 'YMax'))
  } : null;

  const datasetSpatialReference = readSpatialReference(
    child(node, 'SpatialReference')
    || (extentNode ? child(extentNode, 'SpatialReference') : null)
    || (fields.find((field) => field.spatialReference && field.spatialReference.crs) || {}).spatialReference
  );

  return {
    name,
    alias: cleanLine(textAt(node, 'AliasName')) || name,
    kind: isFeatureClass ? 'FeatureClass' : 'Table',
    geometryType: geometryLabel(textAt(node, 'ShapeType')),
    fields,
    extent,
    spatialReference: datasetSpatialReference,
    editorTrackingEnabled: trackingEnabled,
    embeddedMetadata,
    hasGlobalId: /true/i.test(textAt(node, 'HasGlobalID'))
  };
}

/**
 * Parse the WorkspaceDefinition half of the document. The data half, which is
 * the large part, is scanned separately and does not need to be in memory here.
 */
export function parseWorkspaceDefinition(xmlText) {
  const root = parseXml(xmlText);
  const definition = /workspacedefinition/i.test(root.local)
    ? root
    : child(root, 'WorkspaceDefinition');
  if (!definition) throw new Error('No WorkspaceDefinition found. This does not look like an XML Workspace Document.');

  const workspaceDomains = readWorkspaceDomains(definition);
  const container = child(definition, 'DatasetDefinitions') || definition;

  const datasets = [];
  // Feature datasets nest their feature classes, so every DataElement at any
  // depth is considered.
  for (const node of descendants(container, 'DataElement')) {
    const dataset = readDataset(node, workspaceDomains);
    if (dataset && dataset.fields.length) datasets.push(dataset);
  }

  return {
    workspaceType: cleanLine(textAt(definition, 'WorkspaceType')),
    domains: workspaceDomains,
    datasets
  };
}

// -----------------------------------------------------------------------------
// Dataset to project
// -----------------------------------------------------------------------------

/**
 * FGDC attribute width for a field. ArcGIS reports Length for text and a
 * storage size for numbers, and both are what the standard asks for.
 */
function widthFor(field, fgdcType) {
  const length = String(field.length || '').trim();
  if (length && length !== '0') return length;
  return defaultWidth(fgdcType);
}

/**
 * Decimal places. ArcGIS Scale is the number of decimals for a numeric field;
 * where it is absent the model defaults apply.
 */
function decimalsFor(field, fgdcType) {
  if (!typeTakesDecimals(fgdcType)) return '';
  if (fgdcType === 'Integer') return '0';
  const scale = String(field.scale || '').trim();
  if (scale && scale !== '0') return scale;
  return '6';
}

/**
 * Build the project fields from a workspace dataset, carrying domains across.
 */
export function fieldsFromDataset(dataset, stats = null) {
  return dataset.fields.map((field) => {
    const fgdcType = toFgdcType(field.esriType);
    const role = field.isEditorTracking
      ? 'editor'
      : (field.isSystem || fgdcType === 'OID' || fgdcType === 'Geometry' || fgdcType === 'GlobalID'
        ? 'system'
        : undefined);

    const overrides = {
      name: field.name,
      alias: field.alias || humanizeFieldName(field.name),
      type: fgdcType,
      width: widthFor(field, fgdcType),
      decimals: decimalsFor(field, fgdcType),
      role
    };

    // A geodatabase domain is the best possible source for an FGDC domain, so
    // it is carried across verbatim and the user only fills in the wording.
    if (field.domain && field.domain.kind === 'coded' && field.domain.values.length) {
      overrides.domainType = 'edom';
      overrides.values = field.domain.values.map((entry) => ({ ...entry }));
    } else if (field.domain && field.domain.kind === 'range') {
      overrides.domainType = 'rdom';
      overrides.rangeMin = field.domain.min;
      overrides.rangeMax = field.domain.max;
    }

    const built = createField(overrides);

    // Values measured in the exported data. Attached to every field so the
    // editor can show them, but only allowed to change a domain where that is
    // a description of the data rather than a claim about it.
    const observed = stats && stats.fields ? stats.fields[field.name] : null;
    if (observed) {
      built.observed = observed;

      // System and editor tracking fields keep the standard wording from
      // Section 5.1. A measured range on Shape_Area would replace a correct
      // description with a less useful one.
      const isUserField = built.role === 'user';
      const hasRange = observed.min !== null && observed.max !== null;

      if (isUserField && hasRange && built.domainType === 'rdom'
          && !String(built.rangeMin).trim() && !String(built.rangeMax).trim()) {
        // A declared range domain with no bounds: fill it from the data.
        built.rangeMin = String(observed.min);
        built.rangeMax = String(observed.max);
        built.rangeFromData = true;
      } else if (isUserField && hasRange && built.domainType === 'udom'
          && typeTakesDecimals(built.type)) {
        // A number with no declared domain is exactly what an FGDC range
        // domain describes, and the observed bounds are measured fact.
        built.domainType = 'rdom';
        built.rangeMin = String(observed.min);
        built.rangeMax = String(observed.max);
        built.rangeFromData = true;
      }

      // Text values are deliberately NOT turned into an enumerated domain.
      // Four distinct observer names in the data do not make the field a
      // controlled vocabulary, and declaring one would be inventing a schema
      // the geodatabase never had. The values are offered in the editor
      // instead, for the user to accept.
    }

    return built;
  });
}

/**
 * Turn one workspace dataset into a project, optionally merged onto a project
 * already built from metadata embedded in the same export.
 *
 * The workspace always wins on schema facts (fields, geometry, extent,
 * coordinate system, counts) because those come from the data itself. The
 * metadata keeps everything a human wrote: title, abstract, purpose, keywords,
 * lineage.
 */
export function datasetToProject(dataset, options = {}) {
  const { stats = null, base = createProject(), metadataProject = null } = options;
  const project = metadataProject ? { ...metadataProject } : { ...base };

  project.entityName = dataset.name;
  if (!cleanLine(project.title)) {
    // The alias is the closest thing to a human title the geodatabase holds.
    project.title = dataset.alias && dataset.alias !== dataset.name
      ? dataset.alias
      : humanizeFieldName(dataset.name);
  }
  if (!clean(project.entityDescription)) {
    project.entityDescription = clean(project.abstract);
  }

  project.dataType = 'Vector';
  if (dataset.kind === 'FeatureClass') {
    project.geometryType = dataset.geometryType
      || (dataset.fields.find((field) => field.geometryType) || {}).geometryType
      || '';
    project.geoform = 'vector digital data';
  } else {
    project.geometryType = '';
    project.geoform = 'tabular digital data';
  }

  // Coordinate system: the dataset's own, which is the source and analysis CRS.
  const spatial = dataset.spatialReference || {};
  if (spatial.crs) {
    project.analysisCrsEpsg = spatial.crs.epsg;
  } else if (spatial.wkid || spatial.wkt) {
    project.analysisCrsEpsg = '';
    project.customCrs = {
      ...project.customCrs,
      epsg: spatial.wkid || '',
      label: (/PROJCS\s*\[\s*"([^"]+)"/.exec(spatial.wkt || '') || [])[1] || `EPSG ${spatial.wkid}`,
      kind: 'planar',
      wkt: spatial.wkt || ''
    };
  }

  // Extent, converted from native coordinates to the decimal degrees FGDC
  // requires. When the projection cannot be inverted the box is left empty and
  // the user is asked, rather than filled in with something wrong.
  if (dataset.extent && spatial.crs) {
    const box = extentToBoundingBox(dataset.extent, spatial.crs);
    if (box) {
      project.westbc = String(box.westbc);
      project.eastbc = String(box.eastbc);
      project.northbc = String(box.northbc);
      project.southbc = String(box.southbc);
    }
  }

  if (stats && Number.isFinite(stats.recordCount)) {
    project.featureCount = String(stats.recordCount);
  }

  project.fields = fieldsFromDataset(dataset, stats);
  project.editorTrackingPresent = dataset.editorTrackingEnabled
    || project.fields.some((field) => field.role === 'editor');

  project.importSummary = buildImportSummary(dataset, stats, project, Boolean(metadataProject));
  return project;
}

/**
 * What the workspace gave us and what the user still has to supply. Mirrors the
 * summary the metadata importer produces so the upload screen can show either.
 */
function buildImportSummary(dataset, stats, project, hadMetadata) {
  const found = [];
  const missing = [];

  found.push(`Field schema (${project.fields.length} fields)`);
  if (dataset.kind === 'FeatureClass' && project.geometryType) found.push('Geometry type');

  const spatial = dataset.spatialReference || {};
  if (spatial.crs) {
    found.push(`Coordinate system (${spatial.crs.label})`);
  } else if (spatial.wkid || spatial.wkt) {
    missing.push('Coordinate system (found in the file but not recognized, please confirm)');
  } else {
    missing.push('Coordinate system');
  }

  if (project.westbc && project.eastbc) {
    found.push('Bounding coordinates (converted from the dataset extent)');
  } else if (dataset.extent) {
    missing.push('Bounding coordinates (extent found, but its projection cannot be converted here)');
  } else {
    missing.push('Bounding coordinates');
  }

  if (stats && Number.isFinite(stats.recordCount) && stats.recordCount > 0) {
    found.push(`Feature count (${stats.recordCount.toLocaleString('en-US')}, counted from the exported data)`);
  } else {
    missing.push('Feature count (this export carries no data)');
  }

  const domainFields = project.fields.filter((field) => field.domainType !== 'udom');
  if (domainFields.length) found.push(`Domains for ${domainFields.length} field${domainFields.length === 1 ? '' : 's'}`);
  if (dataset.editorTrackingEnabled) found.push('Editor tracking fields (declared by the geodatabase)');

  if (hadMetadata) {
    found.push('Metadata embedded in the export');
  } else {
    // This is the normal case for a geodatabase nobody has documented yet, and
    // it is most of what the wizard then asks for.
    missing.push('Title, abstract and purpose');
    missing.push('Keywords and ISO topic category');
    missing.push('Lineage sources and process steps');
  }

  const fieldsMissingDefinition = project.fields
    .filter((field) => field.role === 'user' && !clean(field.definition))
    .map((field) => field.name);

  return {
    format: 'ArcGIS XML Workspace Document',
    rootElement: 'esri:Workspace',
    datasetName: dataset.name,
    found,
    missing,
    fieldCount: project.fields.length,
    fieldRoles: {
      user: project.fields.filter((field) => field.role === 'user').length,
      system: project.fields.filter((field) => field.role === 'system').length,
      editor: project.fields.filter((field) => field.role === 'editor').length
    },
    crsSource: spatial.wkid ? `WKID ${spatial.wkid} in the workspace document` : '',
    fieldsMissingDefinition,
    observedValues: Boolean(stats && stats.recordCount)
  };
}

/**
 * A one-line description of a dataset, for the picker.
 */
export function describeDataset(dataset, stats = null) {
  const parts = [dataset.kind === 'FeatureClass' ? (dataset.geometryType || 'Feature class') : 'Table'];
  parts.push(`${dataset.fields.length} field${dataset.fields.length === 1 ? '' : 's'}`);
  if (stats && Number.isFinite(stats.recordCount)) {
    parts.push(`${stats.recordCount.toLocaleString('en-US')} record${stats.recordCount === 1 ? '' : 's'}`);
  }
  if (dataset.spatialReference && dataset.spatialReference.crs) {
    parts.push(crsDisplay(dataset.spatialReference.crs));
  }
  if (dataset.embeddedMetadata) parts.push('has metadata');
  return parts.join(' | ');
}
