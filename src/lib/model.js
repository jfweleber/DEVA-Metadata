// =============================================================================
// PROJECT MODEL AND DEVA CONSTANTS
// =============================================================================
// The single source of truth for what a metadata project holds. The importer
// fills this in, the wizard edits it, and the FGDC and HTML generators read it.
// Nothing else in the app should invent a default.
// =============================================================================

import { cleanLine, humanizeFieldName, todayFgdc } from './text.js';

// -----------------------------------------------------------------------------
// Section 2.6 of the DEVA standard: paste verbatim, never paraphrased.
// -----------------------------------------------------------------------------
export const NPS_USE_CONSTRAINTS = 'The National Park Service shall not be held liable for improper or incorrect use of the data described and/or contained herein. These data and related graphics (i.e., .gif or .jpeg format files) are not legal documents and are not intended to be used as such. The information contained in these data is dynamic and may change over time. The data are not better than the original sources from which they were derived. It is the responsibility of the data user to use the data appropriately and consistently within the limitations of geospatial data in general and these data in particular. The related graphics are intended to aid the data user in acquiring relevant data; it is not appropriate to use the related graphics as data. The National Park Service gives no warranty, expressed or implied, as to the accuracy, reliability, or completeness of these data. It is strongly recommended that these data are directly acquired from an NPS server and not indirectly through other sources which may have changed the data in some way. Although these data have been processed successfully on computer systems at the National Park Service, no warranty expressed or implied is made regarding the utility of the data on other systems for general or scientific purposes, nor shall the act of distribution constitute any such warranty. This disclaimer applies both to individual use of the data and aggregate use with other data.';

export const DEFAULT_ACCESS_CONSTRAINTS = 'None. This dataset is available to the public.';

export const DISTRIBUTION_LIABILITY = NPS_USE_CONSTRAINTS;

// -----------------------------------------------------------------------------
// Section 6: standard contact block.
// -----------------------------------------------------------------------------
export const DEVA_CONTACT = {
  organization: 'National Park Service, Death Valley National Park',
  person: 'Jamie Weleber',
  position: 'NEPA and GIS Specialist',
  address: 'P.O. Box 579',
  city: 'Death Valley',
  state: 'CA',
  postal: '92328',
  country: 'USA',
  phone: '(760) 786-3200',
  email: '',
  credits: 'National Park Service, Death Valley National Park. Prepared under a Great Basin Institute cooperative agreement.'
};

export const METADATA_STANDARD_NAME = 'FGDC Content Standard for Digital Geospatial Metadata';
export const METADATA_STANDARD_VERSION = 'FGDC-STD-001-1998';

// -----------------------------------------------------------------------------
// Section 5.1: geodatabase system fields. Documented in the FGDC eainfo block,
// omitted from the Portal HTML attributes table.
// -----------------------------------------------------------------------------
export const SYSTEM_FIELDS = {
  objectid: {
    definition: 'System-assigned unique identifier. Automatically managed by the geodatabase. Do not edit.',
    domain: 'Sequential positive integers automatically assigned by the geodatabase.'
  },
  fid: {
    definition: 'System-assigned unique identifier. Automatically managed by the geodatabase. Do not edit.',
    domain: 'Sequential positive integers automatically assigned by the geodatabase.'
  },
  shape: {
    definition: 'Feature geometry. Automatically managed by the geodatabase.',
    domain: 'Coordinates defining the feature geometry.'
  },
  globalid: {
    definition: 'Globally unique identifier (GUID) assigned by the system for replication and sync.',
    domain: 'System-generated globally unique identifiers.'
  },
  shape_length: {
    definition: "Calculated perimeter or length in the layer's coordinate system units. Automatically maintained by the geodatabase.",
    domain: 'Positive real numbers automatically calculated from feature geometry.'
  },
  shape_area: {
    definition: "Calculated polygon area in the layer's coordinate system units. Automatically maintained by the geodatabase.",
    domain: 'Positive real numbers automatically calculated from polygon geometry.'
  },
  shape__length: {
    definition: "Calculated perimeter or length in the layer's coordinate system units. Automatically maintained by the geodatabase.",
    domain: 'Positive real numbers automatically calculated from feature geometry.'
  },
  shape__area: {
    definition: "Calculated polygon area in the layer's coordinate system units. Automatically maintained by the geodatabase.",
    domain: 'Positive real numbers automatically calculated from polygon geometry.'
  }
};

// Section 5.2: editor tracking fields, excluded from both artifacts by default.
export const EDITOR_TRACKING_FIELDS = ['creationdate', 'creator', 'editdate', 'editor',
  'created_user', 'created_date', 'last_edited_user', 'last_edited_date'];

export const EDITOR_TRACKING_NOTE = 'Editor tracking is enabled on this layer. The CreationDate, Creator, EditDate and Editor fields are intentionally undocumented because NPS policy restricts display of individual editor identities.';

/**
 * ISO 19115 topic categories. ArcGIS writes the numeric code, the FGDC record
 * needs the name, so both are kept together.
 */
export const ISO_TOPIC_CATEGORIES = [
  { code: '001', name: 'farming' },
  { code: '002', name: 'biota' },
  { code: '003', name: 'boundaries' },
  { code: '004', name: 'climatologyMeteorologyAtmosphere' },
  { code: '005', name: 'economy' },
  { code: '006', name: 'elevation' },
  { code: '007', name: 'environment' },
  { code: '008', name: 'geoscientificInformation' },
  { code: '009', name: 'health' },
  { code: '010', name: 'imageryBaseMapsEarthCover' },
  { code: '011', name: 'intelligenceMilitary' },
  { code: '012', name: 'inlandWaters' },
  { code: '013', name: 'location' },
  { code: '014', name: 'oceans' },
  { code: '015', name: 'planningCadastre' },
  { code: '016', name: 'society' },
  { code: '017', name: 'structure' },
  { code: '018', name: 'transportation' },
  { code: '019', name: 'utilitiesCommunication' }
];

/**
 * Accept either an ISO code ("002") or a name and return the category name.
 */
export function normalizeIsoTopic(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const byCode = ISO_TOPIC_CATEGORIES.find((entry) => entry.code === raw.padStart(3, '0'));
  if (byCode) return byCode.name;
  const target = raw.toLowerCase().replace(/[^a-z]/g, '');
  const byName = ISO_TOPIC_CATEGORIES.find((entry) => entry.name.toLowerCase() === target);
  return byName ? byName.name : cleanLine(raw);
}

/**
 * FGDC attribute type terms permitted by the standard (Section 2.4).
 */
export const FGDC_TYPES = ['String', 'Integer', 'Single', 'Double', 'Date', 'OID', 'Geometry', 'GlobalID'];

/**
 * Map the type names ArcGIS writes to the FGDC terms the standard requires.
 */
const ESRI_TYPE_MAP = {
  oid: 'OID',
  objectid: 'OID',
  esrifieldtypeoid: 'OID',
  geometry: 'Geometry',
  esrifieldtypegeometry: 'Geometry',
  globalid: 'GlobalID',
  esrifieldtypeglobalid: 'GlobalID',
  guid: 'GlobalID',
  esrifieldtypeguid: 'GlobalID',
  string: 'String',
  text: 'String',
  esrifieldtypestring: 'String',
  smallinteger: 'Integer',
  short: 'Integer',
  esrifieldtypesmallinteger: 'Integer',
  integer: 'Integer',
  long: 'Integer',
  int: 'Integer',
  bigint: 'Integer',
  esrifieldtypeinteger: 'Integer',
  single: 'Single',
  float: 'Single',
  esrifieldtypesingle: 'Single',
  double: 'Double',
  number: 'Double',
  real: 'Double',
  esrifieldtypedouble: 'Double',
  date: 'Date',
  datetime: 'Date',
  esrifieldtypedate: 'Date',
  blob: 'String',
  raster: 'String'
};

export function toFgdcType(rawType) {
  const key = String(rawType || '').toLowerCase().replace(/[^a-z]/g, '');
  return ESRI_TYPE_MAP[key] || (rawType ? cleanLine(rawType) : 'String');
}

/**
 * Numeric FGDC types carry atnumdec; String, Date, Geometry and OID must not.
 */
export function typeTakesDecimals(fgdcType) {
  return fgdcType === 'Double' || fgdcType === 'Single' || fgdcType === 'Integer';
}

/**
 * Classify a field so the app can pre-fill descriptions and set HTML visibility.
 * Returns 'system', 'editor' or 'user'.
 */
export function classifyField(name) {
  const key = String(name || '').toLowerCase();
  if (EDITOR_TRACKING_FIELDS.includes(key)) return 'editor';
  if (SYSTEM_FIELDS[key]) return 'system';
  if (key === 'shape_leng' || key === 'shapearea' || key === 'shapelength') return 'system';
  return 'user';
}

/**
 * Default width when ArcGIS did not report one. Geometry and OID use the
 * values shown in the worked example in the standard.
 */
export function defaultWidth(fgdcType) {
  switch (fgdcType) {
    case 'Geometry': return '0';
    case 'OID': return '4';
    case 'Double': return '8';
    case 'Single': return '4';
    case 'Integer': return '4';
    case 'Date': return '8';
    case 'GlobalID': return '38';
    default: return '255';
  }
}

/**
 * A blank attribute record. `domainType` is one of udom, edom or rdom
 * (Section 2.5).
 */
export function createField(overrides = {}) {
  const name = cleanLine(overrides.name || '');
  const fgdcType = toFgdcType(overrides.type || 'String');
  const role = overrides.role || classifyField(name);
  const preset = SYSTEM_FIELDS[String(name).toLowerCase()];
  return {
    name,
    // System and editor fields keep their literal name as the alias, matching
    // the worked example in the standard (OBJECTID, Shape, Shape_Area).
    alias: cleanLine(overrides.alias || '') || (role === 'user' ? humanizeFieldName(name) : name),
    type: fgdcType,
    width: String(overrides.width || defaultWidth(fgdcType)),
    decimals: overrides.decimals !== undefined && overrides.decimals !== null
      ? String(overrides.decimals)
      : (typeTakesDecimals(fgdcType) ? (fgdcType === 'Integer' ? '0' : '6') : ''),
    definition: overrides.definition || (preset ? preset.definition : ''),
    definitionSource: overrides.definitionSource
      || (role === 'user' ? 'Death Valley National Park' : 'ESRI'),
    domainType: overrides.domainType || (preset ? 'udom' : (role === 'user' ? 'udom' : 'udom')),
    udom: overrides.udom || (preset ? preset.domain : ''),
    values: overrides.values || [],
    rangeMin: overrides.rangeMin || '',
    rangeMax: overrides.rangeMax || '',
    units: overrides.units || '',
    role,
    // Section 5.1: system and editor fields are documented in XML only.
    includeInHtml: overrides.includeInHtml !== undefined ? overrides.includeInHtml : role === 'user',
    includeInXml: overrides.includeInXml !== undefined ? overrides.includeInXml : role !== 'editor'
  };
}

export function createSource(overrides = {}) {
  return {
    originator: '',
    title: '',
    pubdate: '',
    scale: '',
    typesrc: 'online',
    citationAbbrev: '',
    contribution: '',
    url: '',
    ...overrides
  };
}

export function createProcessStep(overrides = {}) {
  return { description: '', date: '', ...overrides };
}

/**
 * A complete, empty project. Every field the wizard can edit is declared here
 * so that saved drafts and fresh sessions have the same shape.
 */
export function createProject(overrides = {}) {
  const today = todayFgdc();
  return {
    schemaVersion: 1,
    savedAt: '',

    // --- Identification -----------------------------------------------------
    title: '',
    originators: ['National Park Service, Death Valley National Park'],
    pubdate: today,
    edition: '',
    geoform: 'vector digital data',
    onlink: '',
    abstract: '',
    purpose: '',
    supplemental: '',

    // --- Time period and status --------------------------------------------
    timePeriodType: 'single',
    calendarDate: today,
    beginDate: '',
    endDate: '',
    currentness: 'publication date',
    progress: 'Complete',
    updateFrequency: 'As needed',

    // --- Spatial domain -----------------------------------------------------
    westbc: '',
    eastbc: '',
    northbc: '',
    southbc: '',
    extentDescription: 'Death Valley National Park, California and Nevada',

    // --- Keywords -----------------------------------------------------------
    themeKeywordThesaurus: 'None',
    themeKeywords: [],
    isoTopicCategory: '',
    placeKeywords: ['Death Valley National Park', 'Death Valley', 'Inyo County', 'California'],
    placeKeywordThesaurus: 'None',

    // --- Constraints --------------------------------------------------------
    accessConstraints: DEFAULT_ACCESS_CONSTRAINTS,
    useConstraints: NPS_USE_CONSTRAINTS,

    // --- Contact ------------------------------------------------------------
    contact: { ...DEVA_CONTACT },

    // --- Data quality -------------------------------------------------------
    attributeAccuracy: '',
    logicalConsistency: 'Geometry and attribute values were reviewed in ArcGIS Pro. Topology errors were corrected during processing.',
    completeness: 'The dataset covers the full extent described above. No known omissions.',
    positionalAccuracy: '',
    sources: [],
    processSteps: [],
    // Section 2.3: when the service CRS differs from the analysis CRS, the last
    // process step has to say so explicitly.
    appendCrsNote: true,

    // --- Spatial data organization -----------------------------------------
    dataType: 'Vector',
    geometryType: '',
    featureCount: '',
    rasterCellSize: '',
    rasterRowCount: '',
    rasterColumnCount: '',

    // --- Spatial reference --------------------------------------------------
    analysisCrsEpsg: '26911',
    serviceCrsEpsg: '3857',
    documentedCrs: 'service',
    customCrs: { epsg: '', label: '', kind: 'planar', datum: 'nad83', units: 'meters', wkt: '' },

    // --- Entity and attributes ---------------------------------------------
    entityName: '',
    entityDescription: '',
    entityDescriptionSource: 'Death Valley National Park',
    fields: [],
    editorTrackingPresent: false,

    // --- Distribution -------------------------------------------------------
    distributionFormat: 'ArcGIS Hosted Feature Layer',
    distributionUrl: '',
    distributionFees: 'None',

    // --- Portal item fields (Section 4.1) -----------------------------------
    summary: '',
    portalTags: '',

    // --- Guided writer ------------------------------------------------------
    // The answers behind the drafted prose, kept so a draft can be revised
    // rather than re-answered.
    guided: null,

    // --- Metadata record ----------------------------------------------------
    metadataDate: today,

    // --- HTML snippet extras ------------------------------------------------
    htmlOverview: '',
    htmlClassification: { heading: 'Classification', intro: '', rows: [] },
    htmlMethodology: '',
    htmlDataQuality: '',
    htmlReferences: [],
    htmlCaution: '',
    htmlNote: '',
    htmlCreatedBy: 'Jamie Weleber, Death Valley National Park - NEPA and GIS Specialist',
    htmlIncludeMethodologySources: true,

    // --- Provenance of the upload ------------------------------------------
    importSummary: null,
    ...overrides
  };
}
