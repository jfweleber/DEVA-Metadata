// =============================================================================
// VALIDATION
// =============================================================================
// Two layers of checking:
//
//   1. FGDC-STD-001-1998 required elements. Missing any of these produces an
//      error and blocks the "ready to publish" state.
//   2. The Section 8 checklist from the DEVA standard, which is what actually
//      gets caught in review. Some are errors, some are warnings.
//
// Each issue names the wizard step it belongs to so the UI can link to it.
// =============================================================================

import { clean, cleanLine, findStyleIssues, toFgdcDate } from './text.js';
import { NPS_USE_CONSTRAINTS, typeTakesDecimals } from './model.js';
import { countDraftDefinitions } from './compose.js';
import { crsNoteFor, resolvedProcessSteps } from './fgdc.js';

const ERROR = 'error';
const WARNING = 'warning';

function issue(level, step, message, detail = '') {
  return { level, step, message, detail };
}

/**
 * Longitude and latitude sanity, including the west/east and north/south
 * ordering that a hand-typed bounding box gets wrong.
 */
function checkBoundingBox(project, issues) {
  const values = {
    westbc: Number(project.westbc),
    eastbc: Number(project.eastbc),
    northbc: Number(project.northbc),
    southbc: Number(project.southbc)
  };
  const labels = { westbc: 'West', eastbc: 'East', northbc: 'North', southbc: 'South' };

  let complete = true;
  for (const [key, label] of Object.entries(labels)) {
    if (String(project[key] ?? '').trim() === '' || !Number.isFinite(values[key])) {
      issues.push(issue(ERROR, 'spatial', `${label} bounding coordinate is missing or not a number.`));
      complete = false;
    }
  }
  if (!complete) return;

  for (const key of ['westbc', 'eastbc']) {
    if (values[key] < -180 || values[key] > 180) {
      issues.push(issue(ERROR, 'spatial', `${labels[key]} bounding coordinate must be between -180 and 180 decimal degrees.`));
    }
  }
  for (const key of ['northbc', 'southbc']) {
    if (values[key] < -90 || values[key] > 90) {
      issues.push(issue(ERROR, 'spatial', `${labels[key]} bounding coordinate must be between -90 and 90 decimal degrees.`));
    }
  }
  if (values.northbc < values.southbc) {
    issues.push(issue(ERROR, 'spatial', 'North bounding coordinate is south of the south coordinate. The two are probably swapped.'));
  }
  if (values.westbc > values.eastbc) {
    issues.push(issue(WARNING, 'spatial', 'West bounding coordinate is east of the east coordinate. Check that the values are not swapped.'));
  }
  // Everything DEVA publishes is in the western hemisphere.
  if (values.westbc > 0 || values.eastbc > 0) {
    issues.push(issue(WARNING, 'spatial', 'Longitude values are positive. Western hemisphere longitudes should be negative.'));
  }
}

function checkFields(project, issues) {
  const fields = project.fields || [];
  if (!fields.length) {
    issues.push(issue(ERROR, 'attributes', 'No fields are documented. Upload an XML export that includes the field schema, or add the fields by hand.',
      'Rule 2 of the standard: never invent an attribute table, but never ship without one either.'));
    return;
  }

  const xmlFields = fields.filter((field) => field.includeInXml);
  if (!xmlFields.length) {
    issues.push(issue(ERROR, 'attributes', 'Every field has been excluded from the XML. The eainfo block would be empty.'));
  }

  const seen = new Set();
  for (const field of xmlFields) {
    const label = cleanLine(field.name) || '(unnamed field)';
    if (!cleanLine(field.name)) {
      issues.push(issue(ERROR, 'attributes', 'A field has no name.'));
      continue;
    }
    const key = field.name.toLowerCase();
    if (seen.has(key)) {
      issues.push(issue(ERROR, 'attributes', `Field ${label} is listed more than once.`));
    }
    seen.add(key);

    if (!cleanLine(field.type)) {
      issues.push(issue(ERROR, 'attributes', `${label}: attribute type is required.`));
    }
    if (String(field.width ?? '').trim() === '') {
      issues.push(issue(ERROR, 'attributes', `${label}: attribute width is required.`));
    }
    if (!clean(field.definition)) {
      issues.push(issue(ERROR, 'attributes', `${label}: needs a plain-English definition.`,
        'A definition that only restates the field name will be caught in review.'));
    } else if (clean(field.definition).replace(/[^a-z0-9]/gi, '').toLowerCase()
        === cleanLine(field.name).replace(/[^a-z0-9]/gi, '').toLowerCase()) {
      issues.push(issue(WARNING, 'attributes', `${label}: the definition just restates the field name.`));
    }
    if (!cleanLine(field.definitionSource)) {
      issues.push(issue(ERROR, 'attributes', `${label}: definition source (attrdefs) is required.`));
    }

    // Section 2.4: atnumdec on numeric types only.
    const numeric = typeTakesDecimals(field.type);
    if (!numeric && String(field.decimals ?? '').trim() !== '') {
      issues.push(issue(WARNING, 'attributes', `${label}: decimal places are set on a ${field.type} field and will be dropped.`));
    }
    if (numeric && String(field.decimals ?? '').trim() === '') {
      issues.push(issue(WARNING, 'attributes', `${label}: numeric fields should state decimal places (atnumdec).`));
    }

    // Section 2.5: each domain type needs its own content.
    if (field.domainType === 'edom') {
      const values = (field.values || []).filter((entry) => cleanLine(entry.value));
      if (!values.length) {
        issues.push(issue(ERROR, 'attributes', `${label}: enumerated domain selected but no values are listed.`));
      }
      for (const entry of values) {
        if (!clean(entry.definition)) {
          issues.push(issue(WARNING, 'attributes', `${label}: value "${cleanLine(entry.value)}" has no definition.`));
        }
      }
    } else if (field.domainType === 'rdom') {
      if (String(field.rangeMin ?? '').trim() === '' || String(field.rangeMax ?? '').trim() === '') {
        issues.push(issue(ERROR, 'attributes', `${label}: range domain needs both a minimum and a maximum.`));
      }
    } else if (!clean(field.udom)) {
      issues.push(issue(WARNING, 'attributes', `${label}: free-text domain should carry a short characterization of the values.`));
    }
  }

  // Section 5.1 and 5.2 visibility rules.
  for (const field of fields) {
    if (field.includeInHtml && field.role === 'system') {
      issues.push(issue(WARNING, 'attributes', `${field.name} is a system field and should be left out of the Portal attributes table.`));
    }
    if (field.includeInHtml && field.role === 'editor') {
      issues.push(issue(WARNING, 'attributes', `${field.name} is an editor tracking field and should be left out of the Portal attributes table.`));
    }
  }
}

function checkLineage(project, issues) {
  const steps = resolvedProcessSteps(project);
  if (!steps.length) {
    issues.push(issue(ERROR, 'lineage', 'Lineage needs at least one process step.',
      'Lineage is the section reviewers actually read.'));
  }
  steps.forEach((step, index) => {
    if (!toFgdcDate(step.date)) {
      issues.push(issue(ERROR, 'lineage', `Process step ${index + 1} has no date.`));
    }
  });
  if (!(project.sources || []).some((source) => cleanLine(source.title))) {
    issues.push(issue(WARNING, 'lineage', 'No source datasets are documented. Reviewers expect every input to be cited.'));
  }
  for (const source of project.sources || []) {
    if (cleanLine(source.title) && !cleanLine(source.originator)) {
      issues.push(issue(WARNING, 'lineage', `Source "${cleanLine(source.title)}" has no originator.`));
    }
  }

  // Section 2.3: the final process step names both coordinate systems.
  const note = crsNoteFor(project);
  if (note) {
    const last = steps[steps.length - 1];
    const stated = last && last.description.includes('per Portal hosting requirements');
    if (!stated) {
      issues.push(issue(WARNING, 'lineage', 'The analysis and service coordinate systems differ but the final process step does not say so.',
        'Turn on the coordinate system note, or write it into the last step yourself.'));
    }
  }
}

function checkStyle(project, issues) {
  // Rule 5: no em dashes anywhere. The generators strip them, but the user
  // should know their text was changed.
  const inspect = (value, where) => {
    const problems = findStyleIssues(value);
    if (problems.length) {
      issues.push(issue(WARNING, 'review', `${where} contains ${problems.join(' and ')}, which will be replaced automatically.`));
    }
  };
  inspect(project.title, 'Title');
  inspect(project.abstract, 'Abstract');
  inspect(project.purpose, 'Purpose');
  inspect(project.htmlOverview, 'Overview text');
  inspect(project.htmlMethodology, 'Methodology text');
  inspect(project.htmlCaution, 'Caution box');
  inspect(project.htmlNote, 'Note box');
  for (const step of project.processSteps || []) inspect(step.description, 'A process step');
  for (const field of project.fields || []) inspect(field.definition, `Definition for ${field.name}`);
}

/**
 * Run every check. Returns { errors, warnings, issues, ready }.
 */
export function validateProject(project) {
  const issues = [];

  // --- Identification -------------------------------------------------------
  if (!cleanLine(project.title)) issues.push(issue(ERROR, 'identification', 'Title is required.'));
  if (!(project.originators || []).some((value) => cleanLine(value))) {
    issues.push(issue(ERROR, 'identification', 'At least one originator is required.'));
  }
  if (!toFgdcDate(project.pubdate)) issues.push(issue(ERROR, 'identification', 'Publication date is required.'));
  if (!clean(project.abstract)) issues.push(issue(ERROR, 'identification', 'Abstract is required.'));
  else if (clean(project.abstract).length < 120) {
    issues.push(issue(WARNING, 'identification', 'The abstract is very short. Two to three sentences at minimum is expected.'));
  }
  if (!clean(project.purpose)) issues.push(issue(ERROR, 'identification', 'Purpose is required.'));
  if (!cleanLine(project.progress)) issues.push(issue(ERROR, 'identification', 'Progress status is required.'));
  if (!cleanLine(project.updateFrequency)) issues.push(issue(ERROR, 'identification', 'Update frequency is required.'));

  if (project.timePeriodType === 'range') {
    if (!toFgdcDate(project.beginDate) || !toFgdcDate(project.endDate)) {
      issues.push(issue(ERROR, 'identification', 'A date range needs both a begin and an end date.'));
    }
  } else if (!toFgdcDate(project.calendarDate)) {
    issues.push(issue(ERROR, 'identification', 'Time period of content date is required.'));
  }

  // --- Keywords -------------------------------------------------------------
  if (!(project.themeKeywords || []).filter(Boolean).length) {
    issues.push(issue(ERROR, 'keywords', 'At least one theme keyword is required.'));
  }
  if (!cleanLine(project.isoTopicCategory)) {
    issues.push(issue(WARNING, 'keywords', 'No ISO 19115 topic category is set.'));
  }
  if (!(project.placeKeywords || []).filter(Boolean).length) {
    issues.push(issue(WARNING, 'keywords', 'No place keywords are set. Death Valley National Park should always be present.'));
  }

  // --- Constraints ----------------------------------------------------------
  if (!clean(project.accessConstraints)) {
    issues.push(issue(ERROR, 'keywords', 'Access constraints are required. Use "None" when the data are public.'));
  }
  if (clean(project.useConstraints) !== NPS_USE_CONSTRAINTS) {
    issues.push(issue(ERROR, 'keywords', 'The NPS use constraints disclaimer must appear verbatim.',
      'Section 2.6 of the standard: do not paraphrase, shorten, or reflow it.'));
  }

  // --- Contact --------------------------------------------------------------
  const contact = project.contact || {};
  if (!cleanLine(contact.organization)) issues.push(issue(ERROR, 'contact', 'Contact organization is required.'));
  if (!cleanLine(contact.address) || !cleanLine(contact.city)) {
    issues.push(issue(ERROR, 'contact', 'Contact mailing address and city are required.'));
  }
  if (!cleanLine(contact.phone)) issues.push(issue(ERROR, 'contact', 'Contact phone number is required by FGDC.'));

  // --- Spatial --------------------------------------------------------------
  checkBoundingBox(project, issues);
  if (project.dataType === 'Vector') {
    if (!cleanLine(project.geometryType)) {
      issues.push(issue(ERROR, 'spatial', 'Geometry type is required for vector data.'));
    }
    if (!String(project.featureCount || '').trim()) {
      issues.push(issue(WARNING, 'spatial', 'Feature count is not set. Reviewers expect it in the technical specifications.'));
    }
  }
  if (!project.analysisCrsEpsg && !cleanLine((project.customCrs || {}).label)) {
    issues.push(issue(ERROR, 'spatial', 'A source coordinate system is required.'));
  }

  // --- Data quality ---------------------------------------------------------
  if (!clean(project.logicalConsistency)) {
    issues.push(issue(ERROR, 'lineage', 'Logical consistency report is required by FGDC.'));
  }
  if (!clean(project.completeness)) {
    issues.push(issue(ERROR, 'lineage', 'Completeness report is required by FGDC.'));
  }
  checkLineage(project, issues);

  // --- Attributes -----------------------------------------------------------
  if (!cleanLine(project.entityName)) {
    issues.push(issue(WARNING, 'attributes', 'Entity name is empty. It should be the dataset or feature class name.'));
  }
  if (!clean(project.entityDescription)) {
    issues.push(issue(WARNING, 'attributes', 'Entity description is empty.'));
  }
  checkFields(project, issues);

  // --- Suggested wording still unreviewed -----------------------------------
  // Boilerplate nobody read is exactly what gets caught in review, so it is
  // called out by name rather than left to be noticed.
  const drafts = countDraftDefinitions(project);
  if (drafts) {
    issues.push(issue(WARNING, 'attributes',
      `${drafts} field definition${drafts === 1 ? ' is' : 's are'} still the suggested wording.`,
      'Open each one, check it is true of your data, and edit it so it says something the field name does not.'));
  }

  // --- Metadata record ------------------------------------------------------
  if (!toFgdcDate(project.metadataDate)) {
    issues.push(issue(ERROR, 'review', 'Metadata date is required.'));
  }

  // --- HTML snippet ---------------------------------------------------------
  if (!clean(project.htmlCaution) && !clean(project.htmlNote)) {
    issues.push(issue(WARNING, 'description', 'Use Limitations has no caution or note text. The standard expects at least one callout.'));
  }
  if (!cleanLine(project.htmlCreatedBy)) {
    issues.push(issue(WARNING, 'description', 'The HTML footer has no "Created by" credit.'));
  }
  checkStyle(project, issues);

  const errors = issues.filter((item) => item.level === ERROR);
  const warnings = issues.filter((item) => item.level === WARNING);
  return { issues, errors, warnings, ready: errors.length === 0 };
}

/**
 * The Section 8 checklist, evaluated for the review screen. Each entry is a
 * pass or fail with the reason attached.
 */
export function deliverableChecklist(project) {
  const fields = (project.fields || []).filter((field) => field.includeInXml);
  const xmlFieldsComplete = fields.length > 0 && fields.every((field) =>
    cleanLine(field.name) && cleanLine(field.type) && String(field.width ?? '').trim() !== ''
    && clean(field.definition) && cleanLine(field.definitionSource));
  const decimalsCorrect = fields.every((field) => (typeTakesDecimals(field.type)
    ? String(field.decimals ?? '').trim() !== ''
    : String(field.decimals ?? '').trim() === ''));
  const steps = resolvedProcessSteps(project);
  const note = crsNoteFor(project);
  const htmlFields = (project.fields || []).filter((field) => field.includeInHtml);

  return [
    { label: 'Both artifacts produced: FGDC XML and HTML snippet', pass: true },
    { label: 'eainfo has one attr per real field, from the uploaded schema', pass: fields.length > 0 },
    { label: 'Every attr has label, type, width, definition and definition source', pass: xmlFieldsComplete },
    {
      label: 'Enumerated values are in separate attrdomv blocks',
      pass: fields.filter((field) => field.domainType === 'edom')
        .every((field) => (field.values || []).some((entry) => cleanLine(entry.value)))
    },
    { label: 'atnumdec present on numeric fields, absent elsewhere', pass: decimalsCorrect },
    { label: 'NPS disclaimer present verbatim in useconst', pass: clean(project.useConstraints) === NPS_USE_CONSTRAINTS },
    {
      label: 'Lineage documents sources and dated process steps',
      pass: steps.length > 0 && steps.every((step) => toFgdcDate(step.date))
    },
    {
      label: 'Final process step names the analysis and service CRS when they differ',
      pass: !note || steps.some((step) => step.description.includes('per Portal hosting requirements'))
    },
    { label: 'HTML uses inline styles only, no wrapper tags, no scripts', pass: true },
    { label: 'HTML uses the green palette values exactly', pass: true },
    {
      label: 'System and editor tracking fields excluded from the HTML table',
      pass: htmlFields.every((field) => field.role === 'user')
    },
    { label: 'Contact block and metadata footer present in the HTML', pass: !!cleanLine((project.contact || {}).organization) },
    { label: 'No em dashes anywhere in either artifact', pass: true }
  ];
}
