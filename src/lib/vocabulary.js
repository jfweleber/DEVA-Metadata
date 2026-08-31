// =============================================================================
// CONTROLLED VOCABULARY AND ANSWER OPTIONS
// =============================================================================
// The guided writer asks questions with pick-lists rather than blank boxes,
// because a park GIS specialist can answer "how was this collected" in two
// clicks but will put off writing an abstract for a month.
//
// Every option carries the wording the composer will use, so the generated
// prose is consistent across datasets and across the people writing them. That
// consistency is the point: reviewers are reading for the same things every
// time.
// =============================================================================

/**
 * What kind of layer this is. Drives which questions are asked and how the
 * abstract is shaped.
 */
export const LAYER_KINDS = [
  {
    value: 'field',
    label: 'Field-collected points or surveys',
    hint: 'GPS or mobile collection, monitoring sites, observations, condition assessments.',
    isoTopic: 'biota',
    geoform: 'vector digital data'
  },
  {
    value: 'analysis',
    label: 'Analysis or model output',
    hint: 'Habitat suitability, viewsheds, density surfaces, risk models, derived layers.',
    isoTopic: 'environment',
    geoform: 'vector digital data'
  },
  {
    value: 'boundary',
    label: 'Boundary or administrative area',
    hint: 'Park boundary, wilderness, management zones, parcels, project areas.',
    isoTopic: 'boundaries',
    geoform: 'vector digital data'
  },
  {
    value: 'facilities',
    label: 'Facilities or infrastructure',
    hint: 'Roads, trails, buildings, utilities, signs, campgrounds, water systems.',
    isoTopic: 'structure',
    geoform: 'vector digital data'
  },
  {
    value: 'cultural',
    label: 'Cultural or historic resources',
    hint: 'Sites, features, historic structures, archaeological survey areas.',
    isoTopic: 'society',
    geoform: 'vector digital data'
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'Describe it in your own words.',
    isoTopic: '',
    geoform: 'vector digital data'
  }
];

/**
 * What the layer is used for. Phrased so they can be joined into a sentence.
 */
export const USES = [
  { value: 'nepa', label: 'NEPA analysis and compliance', phrase: 'NEPA analysis and compliance review' },
  { value: 'consultation', label: 'Regulatory consultation', phrase: 'consultation with regulatory agencies' },
  { value: 'planning', label: 'Project and facility planning', phrase: 'project planning and facility siting' },
  { value: 'resource', label: 'Resource management decisions', phrase: 'resource management decision making' },
  { value: 'monitoring', label: 'Monitoring and trend analysis', phrase: 'long-term monitoring and trend analysis' },
  { value: 'protection', label: 'Resource protection', phrase: 'protection of sensitive park resources' },
  { value: 'maintenance', label: 'Maintenance and operations', phrase: 'maintenance planning and daily operations' },
  { value: 'emergency', label: 'Emergency and incident response', phrase: 'emergency and incident response' },
  { value: 'visitor', label: 'Visitor use and safety', phrase: 'visitor use management and safety' },
  { value: 'reference', label: 'General reference and mapping', phrase: 'general reference mapping across the park' }
];

/**
 * How the data came to exist. Each supplies both abstract wording and a draft
 * lineage process step, because the same answer serves both.
 */
export const METHODS = [
  {
    value: 'gps',
    label: 'GPS field collection',
    phrase: 'collected in the field with GPS receivers',
    fragment: 'with GPS receivers',
    step: 'Collected feature locations in the field using GPS receivers. Positions were recorded at each feature and attributes were entered at the time of collection.'
  },
  {
    value: 'mobile',
    label: 'Field Maps or Survey123',
    phrase: 'collected in the field using ArcGIS Field Maps and Survey123',
    fragment: 'using ArcGIS Field Maps and Survey123',
    step: 'Collected features in the field using ArcGIS Field Maps and Survey123 forms configured for this project. Records synced to the hosted feature layer as crews completed each site.'
  },
  {
    value: 'digitized',
    label: 'Digitized from imagery',
    phrase: 'digitized on screen from aerial imagery',
    fragment: 'by digitizing from aerial imagery',
    step: 'Digitized features on screen in ArcGIS Pro from aerial imagery. Features were captured at a consistent display scale and reviewed against the imagery after capture.'
  },
  {
    value: 'derived',
    label: 'Derived from another dataset',
    phrase: 'derived from existing park datasets',
    fragment: 'from existing park datasets',
    step: 'Derived features from existing park datasets using ArcGIS Pro geoprocessing tools. Source datasets and the tools applied are listed in the source citations above.'
  },
  {
    value: 'model',
    label: 'Model or analysis output',
    phrase: 'produced as the output of a spatial analysis',
    fragment: 'through spatial analysis',
    step: 'Produced this layer as the output of a spatial analysis in ArcGIS Pro. The analysis inputs, tools and parameter settings are documented in the preceding process steps.'
  },
  {
    value: 'agency',
    label: 'Received from another agency',
    phrase: 'obtained from another agency and adapted for park use',
    fragment: 'from data supplied by another agency',
    step: 'Obtained the source dataset from the originating agency and reprojected and clipped it to the park boundary for use in park mapping and analysis.'
  },
  {
    value: 'records',
    label: 'Compiled from records or reports',
    phrase: 'compiled from park records and reports',
    fragment: 'from park records and reports',
    step: 'Compiled locations and attributes from park records and reports, then created features at the described locations and recorded the source of each record.'
  },
  {
    value: 'survey',
    label: 'Professional or cadastral survey',
    phrase: 'based on professional survey control',
    fragment: 'from professional survey control',
    step: 'Created features from professional survey data. Coordinates were transformed into the park working coordinate system and checked against survey monuments.'
  }
];

/**
 * Known limits on the data. These become the data quality section and feed the
 * caution box, which is where reviewers look for honesty about the data.
 */
export const LIMITATIONS = [
  {
    value: 'recreational_gps',
    label: 'Recreational-grade GPS accuracy',
    quality: 'Positions were recorded with recreational-grade GPS receivers, which are typically accurate to within 3 to 10 meters under open sky and less accurate in canyons and under cover.',
    caution: 'Positions are accurate to within roughly 3 to 10 meters and are not survey grade.'
  },
  {
    value: 'mapping_gps',
    label: 'Mapping-grade GPS accuracy',
    quality: 'Positions were recorded with mapping-grade GPS receivers with post-processing, and are typically accurate to within 1 meter.',
    caution: 'Positions are mapping grade and are not a substitute for a professional boundary survey.'
  },
  {
    value: 'not_survey',
    inCaution: true,
    label: 'Not survey grade',
    quality: 'These data were not produced by a licensed surveyor and do not establish legal boundaries or property lines.',
    caution: 'These data do not establish legal boundaries and must not be used for property, easement or right-of-way determinations.'
  },
  {
    value: 'incomplete',
    label: 'Coverage is incomplete',
    quality: 'Coverage is not complete across the park. Areas that have not been visited or surveyed are simply absent from the dataset, and absence of a feature does not mean absence on the ground.',
    caution: 'Absence of a feature in this layer does not mean the feature is absent on the ground. Unsurveyed areas are not represented.'
  },
  {
    value: 'snapshot',
    label: 'Snapshot in time',
    quality: 'The dataset reflects conditions as of the collection dates given above. Conditions in the field change, and the data are not updated continuously.',
    caution: 'Conditions change. Check the collection dates before relying on this layer for current conditions.'
  },
  {
    value: 'planning_only',
    inCaution: true,
    label: 'Planning-level only',
    quality: 'The dataset is intended for planning-level use at park and landscape scales, not for site-specific determinations.',
    caution: 'This is a planning-level layer. Verify conditions in the field before making site-specific decisions.'
  },
  {
    value: 'model_uncertainty',
    inCaution: true,
    label: 'Model output, not observation',
    quality: 'Values are model predictions rather than field observations. Model outputs carry uncertainty from the inputs and assumptions used to produce them.',
    caution: 'Values are modeled predictions, not observations, and have not been validated in the field at every location.'
  },
  {
    value: 'generalized',
    inCaution: true,
    label: 'Locations generalized on purpose',
    quality: 'Locations of sensitive resources have been generalized or offset in the public version of this dataset.',
    caution: 'Sensitive locations are generalized in this version. Do not use it to determine exact resource locations.'
  },
  {
    value: 'scale',
    inCaution: true,
    label: 'Captured at a fixed scale',
    quality: 'Features were captured at a consistent display scale. Zooming in past that scale shows more precision than the data actually carry.',
    caution: 'Do not use this layer at scales larger than it was captured for.'
  }
];

/**
 * Sensitivity. NPS restricts release of some resource locations, so this
 * changes the access constraints as well as the caution box.
 */
export const SENSITIVITY = [
  {
    value: 'none',
    label: 'Not sensitive, can be public',
    access: 'None. This dataset is available to the public.'
  },
  {
    value: 'species',
    label: 'Sensitive species locations',
    access: 'Restricted. These data show locations of sensitive species and are shared only with National Park Service staff and authorized partners. Release outside the National Park Service requires approval from the park resource manager.',
    caution: 'These data include locations of sensitive species. Do not redistribute them or publish maps showing precise locations.'
  },
  {
    value: 'cultural',
    label: 'Cultural or archaeological sites',
    access: 'Restricted. These data show locations of cultural resources and are withheld from public release under the National Historic Preservation Act and the Archaeological Resources Protection Act. Distribution is limited to National Park Service staff and authorized partners.',
    caution: 'These data include locations of cultural resources. Their release is restricted by law. Do not redistribute them or publish maps showing precise locations.'
  },
  {
    value: 'both',
    label: 'Both species and cultural',
    access: 'Restricted. These data show locations of sensitive species and cultural resources and are withheld from public release. Distribution is limited to National Park Service staff and authorized partners, and release requires approval from the park resource manager.',
    caution: 'These data include locations of sensitive species and cultural resources. Their release is restricted. Do not redistribute them or publish maps showing precise locations.'
  }
];

/**
 * Keyword suggestions matched against the title, subject and field names.
 * Deliberately small and DEVA specific: a huge thesaurus produces noise, and
 * theme keywords are supposed to be the words someone would actually search.
 */
export const KEYWORD_HINTS = [
  { match: /tortoise|gopherus/i, keywords: ['desert tortoise', 'threatened species', 'wildlife'], iso: 'biota' },
  { match: /bighorn|sheep/i, keywords: ['bighorn sheep', 'wildlife'], iso: 'biota' },
  { match: /pupfish|fish/i, keywords: ['pupfish', 'aquatic species', 'wildlife'], iso: 'biota' },
  { match: /bat\b|roost/i, keywords: ['bats', 'wildlife'], iso: 'biota' },
  { match: /bird|avian|raptor/i, keywords: ['birds', 'wildlife'], iso: 'biota' },
  { match: /veget|plant|flora|cactus|joshua/i, keywords: ['vegetation', 'plants'], iso: 'biota' },
  { match: /invasive|weed|tamarisk/i, keywords: ['invasive species', 'vegetation management'], iso: 'biota' },
  { match: /spring|seep|water|hydro|stream|wetland/i, keywords: ['water resources', 'springs'], iso: 'inlandWaters' },
  { match: /well|groundwater|aquifer/i, keywords: ['groundwater', 'water resources'], iso: 'inlandWaters' },
  { match: /habitat|suitability|hsi/i, keywords: ['habitat', 'habitat suitability'], iso: 'biota' },
  { match: /wilderness/i, keywords: ['wilderness', 'wilderness character'], iso: 'boundaries' },
  { match: /boundary|parcel|tract|ownership|jurisdiction/i, keywords: ['boundaries', 'land status'], iso: 'boundaries' },
  { match: /road|route|highway/i, keywords: ['roads', 'transportation'], iso: 'transportation' },
  { match: /trail|route|hiking/i, keywords: ['trails', 'recreation'], iso: 'transportation' },
  { match: /building|structure|facilit/i, keywords: ['facilities', 'infrastructure'], iso: 'structure' },
  { match: /campground|camp|picnic/i, keywords: ['campgrounds', 'visitor facilities'], iso: 'structure' },
  { match: /utility|power|sewer|septic|waterline/i, keywords: ['utilities', 'infrastructure'], iso: 'utilitiesCommunication' },
  { match: /archaeolog|cultural|historic|artifact/i, keywords: ['cultural resources', 'archaeology'], iso: 'society' },
  { match: /mine|mining|mill|claim/i, keywords: ['mining history', 'abandoned mineral lands'], iso: 'society' },
  { match: /geolog|fault|alluvial|dune|playa/i, keywords: ['geology', 'geomorphology'], iso: 'geoscientificInformation' },
  { match: /soil/i, keywords: ['soils'], iso: 'geoscientificInformation' },
  { match: /fire|burn|fuel/i, keywords: ['fire management', 'fuels'], iso: 'environment' },
  { match: /air quality|visibility|night sky|soundscape/i, keywords: ['air quality', 'night skies'], iso: 'environment' },
  { match: /flood|debris flow|hazard/i, keywords: ['hazards', 'flooding'], iso: 'environment' },
  { match: /monitor|survey|observation|inventory/i, keywords: ['monitoring', 'inventory'], iso: '' },
  { match: /nepa|project|compliance/i, keywords: ['NEPA', 'planning'], iso: 'planningCadastre' }
];

/**
 * Always present on a DEVA item, per Section 4.1 of the standard.
 */
export const BASE_KEYWORDS = ['National Park Service', 'Death Valley', 'Death Valley National Park', 'DEVA'];

export const BASE_PLACE_KEYWORDS = ['Death Valley National Park', 'Death Valley', 'Inyo County', 'California'];

/**
 * Draft definitions for field names that mean the same thing everywhere.
 * Offered to the user, never applied silently: a definition is something a
 * person has to stand behind.
 */
export const FIELD_DEFINITION_PATTERNS = [
  { match: /(^|_)(observer|recorder|collector|surveyor|crew)/i, definition: 'Name or initials of the person who recorded this record in the field.' },
  { match: /^(notes?|comments?|remarks?|description)$/i, definition: 'Free-text notes recorded by the observer about this feature.' },
  { match: /(date|_dt|datetime)$/i, definition: 'Date on which this record was collected or last updated in the field.' },
  { match: /(^|_)(species|taxon|common_?name|sci_?name)/i, definition: 'Species recorded at this location, given as the name used by the monitoring program.' },
  { match: /(^|_)(counts?|num|number|qty|quantity|total|tally)(_|$)/i, definition: 'Number of individuals or items recorded at this location.' },
  { match: /(status|condition)$/i, definition: 'Condition or status recorded for this feature at the time of the visit.' },
  { match: /^(type|class|category|classification)$/i, definition: 'Classification assigned to this feature.' },
  { match: /^(name|site_?name|feature_?name|label)$/i, definition: 'Name by which this feature is known in the field and in park records.' },
  { match: /^(id|.*_id|code|.*_code|number)$/i, definition: 'Identifier assigned to this feature by the program that maintains the dataset.' },
  { match: /(accuracy|precision|hdop|pdop|error)/i, definition: 'Estimated horizontal accuracy of the recorded position, in meters.' },
  { match: /^(elev|elevation|altitude|z)$/i, definition: 'Elevation of the feature above mean sea level, in the units given below.' },
  { match: /(lat|latitude)$/i, definition: 'Latitude of the feature in decimal degrees.' },
  { match: /(lon|long|longitude)$/i, definition: 'Longitude of the feature in decimal degrees.' },
  { match: /^(acres?|area)$/i, definition: 'Area of the feature in acres, calculated from the feature geometry.' },
  { match: /(hectares?)$/i, definition: 'Area of the feature in hectares, calculated from the feature geometry.' },
  { match: /(length|miles?|meters?|distance)$/i, definition: 'Length of the feature, calculated from the feature geometry.' },
  { match: /^(photo|image|picture|url|link|hyperlink)/i, definition: 'Link to a photograph or document associated with this feature.' },
  { match: /^(source|origin|data_?source)$/i, definition: 'Where this record came from, such as the survey, report or dataset it was taken from.' },
  { match: /^(method|protocol|technique)$/i, definition: 'Method or protocol used to collect this record.' },
  { match: /^(verified|validated|qa|qc|checked)/i, definition: 'Whether this record has been checked against the source or verified in the field.' },
  { match: /^(unit|management_?unit|zone|district|area_?name)$/i, definition: 'Management unit or zone in which this feature falls.' },
  { match: /^(project|nepa|pepc)/i, definition: 'Project this record is associated with, identified by its park project number or name.' }
];

/**
 * Suggest a definition for a field name, or an empty string when nothing in the
 * pattern list is a confident match.
 */
export function suggestFieldDefinition(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  for (const pattern of FIELD_DEFINITION_PATTERNS) {
    if (pattern.match.test(raw)) return pattern.definition;
  }
  return '';
}
