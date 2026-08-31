// =============================================================================
// GUIDED WRITER TESTS
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createGuidedAnswers, applyGuidedDraft, applyFieldDefinitionDrafts, countDraftDefinitions,
  composeAbstract, composePurpose, composeSummary, composeEntityDescription,
  composeCaution, composeDataQuality, composeMethodology, composeProcessSteps,
  suggestThemeKeywords, suggestPlaceKeywords, suggestIsoTopic, composeTags, joinPhrases
} from '../src/lib/compose.js';
import { suggestFieldDefinition, SENSITIVITY, LIMITATIONS } from '../src/lib/vocabulary.js';
import { createProject, DEFAULT_ACCESS_CONSTRAINTS, NPS_USE_CONSTRAINTS } from '../src/lib/model.js';
import { parseWorkspaceDefinition, datasetToProject } from '../src/lib/workspace.js';
import { scanWorkspaceData } from '../src/lib/workspace-data.js';
import { validateProject } from '../src/lib/validate.js';
import { generateFgdcXml } from '../src/lib/fgdc.js';
import { generateHtmlSnippet } from '../src/lib/html.js';
import { findStyleIssues } from '../src/lib/text.js';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceXml = readFileSync(join(here, '..', 'samples', 'workspace-export-tortoise.xml'), 'utf8');

/**
 * A project as it stands straight after a workspace upload, with no metadata.
 */
function uploadedProject() {
  const dataset = parseWorkspaceDefinition(workspaceXml).datasets[0];
  const stats = scanWorkspaceData(workspaceXml).DEVA_GIS_Desert_Tortoise_Core_Habitat;
  const project = datasetToProject(dataset, { stats, base: createProject() });
  project.featureCount = '1478';
  project.geometryType = 'Point';
  return project;
}

function surveyAnswers(overrides = {}) {
  return createGuidedAnswers({
    layerKind: 'field',
    subject: 'desert tortoise observations',
    recordMeaning: 'one tortoise or burrow recorded during a survey transect',
    uses: ['nepa', 'protection'],
    methods: ['mobile', 'gps'],
    collectedBy: 'the DEVA Resource Management division',
    collectionStart: '20250315',
    collectionEnd: '20250630',
    limitations: ['recreational_gps', 'incomplete', 'not_survey'],
    prohibited: 'Do not use these locations to site infrastructure without a current field survey',
    sensitivity: 'species',
    updateCadence: 'Annually',
    ...overrides
  });
}

// -----------------------------------------------------------------------------
test('phrases join as readable English', () => {
  assert.equal(joinPhrases(['a']), 'a');
  assert.equal(joinPhrases(['a', 'b']), 'a and b');
  assert.equal(joinPhrases(['a', 'b', 'c']), 'a, b and c');
  assert.equal(joinPhrases(['a', '', null]), 'a');
});

test('the abstract states what the dataset is, how it was made and what is in it', () => {
  const project = uploadedProject();
  const abstract = composeAbstract(project, surveyAnswers());
  const paragraphs = abstract.split('\n\n');
  assert.equal(paragraphs.length, 3);

  // Facts from the upload, not from the answers.
  assert.match(paragraphs[0], /1,478 points/);
  assert.match(paragraphs[0], /Death Valley National Park/);
  // The record meaning gets its own sentence rather than being wedged in.
  assert.match(paragraphs[0], /Each point represents one tortoise or burrow/);
  // Method, collector and period.
  assert.match(paragraphs[1], /ArcGIS Field Maps and Survey123/);
  assert.match(paragraphs[1], /DEVA Resource Management division/);
  assert.match(paragraphs[1], /March 15, 2025 and June 30, 2025/);
  // Attributes, by alias.
  assert.match(paragraphs[2], /Habitat Category/);
});

test('two collection methods do not repeat the verb', () => {
  const project = uploadedProject();
  const abstract = composeAbstract(project, surveyAnswers({ methods: ['mobile', 'gps'] }));
  // "collected ... and collected ..." is the failure this guards against.
  assert.equal((abstract.match(/The data were collected/g) || []).length, 1);
  assert.match(abstract, /with GPS receivers|using ArcGIS Field Maps/);
});

test('the abstract degrades gracefully when little is answered', () => {
  const project = { ...createProject(), title: 'Test layer' };
  const abstract = composeAbstract(project, createGuidedAnswers());
  assert.ok(abstract.length > 0);
  assert.doesNotMatch(abstract, /undefined|null|\[object/);
});

test('purpose, summary and entity description read as sentences', () => {
  const project = uploadedProject();
  const answers = surveyAnswers();

  const purpose = composePurpose(project, answers);
  assert.match(purpose, /NEPA analysis and compliance review and protection of sensitive park resources/);

  // The subject reads better after a count than the record meaning does.
  const summary = composeSummary(project, answers);
  assert.match(summary, /^1,478 points of desert tortoise observations in Death Valley National Park/);

  assert.equal(composeEntityDescription(project, answers),
    'Each point represents one tortoise or burrow recorded during a survey transect.');
});

test('keywords come from the answers, the schema and the DEVA vocabulary', () => {
  const project = uploadedProject();
  const keywords = suggestThemeKeywords(project, surveyAnswers());
  for (const expected of ['National Park Service', 'Death Valley', 'DEVA', 'desert tortoise', 'threatened species']) {
    assert.ok(keywords.includes(expected), `missing ${expected}`);
  }
  // No duplicates, whatever route they arrived by.
  assert.equal(new Set(keywords.map((k) => k.toLowerCase())).size, keywords.length);

  assert.equal(suggestIsoTopic(project, surveyAnswers()), 'biota');
  assert.equal(suggestIsoTopic(project, surveyAnswers({ subject: 'road centerlines', recordMeaning: '' })), 'transportation');

  const tags = composeTags(project, surveyAnswers());
  assert.match(tags, /DEVA/);
  assert.match(tags, /desert tortoise/);
});

test('Nevada is a place keyword only when the extent reaches it', () => {
  const inCalifornia = { ...createProject(), eastbc: '-117.0' };
  assert.ok(!suggestPlaceKeywords(inCalifornia).includes('Nevada'));
  const crossesStateLine = { ...createProject(), eastbc: '-115.7' };
  assert.ok(suggestPlaceKeywords(crossesStateLine).includes('Nevada'));
});

// -----------------------------------------------------------------------------
test('the caution box holds restrictions, not every caveat', () => {
  const project = uploadedProject();
  const caution = composeCaution(project, surveyAnswers());

  // What the user typed comes first, then sensitivity, then use restrictions.
  assert.match(caution, /^Do not use these locations to site infrastructure/);
  assert.match(caution, /locations of sensitive species/);
  assert.match(caution, /do not establish legal boundaries/);

  // Accuracy and coverage describe the data and belong in data quality, not in
  // a warning box nobody finishes reading.
  assert.doesNotMatch(caution, /3 to 10 meters/);
  assert.doesNotMatch(caution, /Unsurveyed areas/);

  const quality = composeDataQuality(project, surveyAnswers());
  assert.match(quality, /3 to 10 meters/);
  assert.match(quality, /Coverage is not complete/);
});

test('sensitivity drives the access constraints even over the public default', () => {
  const project = createProject();
  assert.equal(project.accessConstraints, DEFAULT_ACCESS_CONSTRAINTS);

  // The regression: "keep what is already there" left a sensitive dataset
  // marked as available to the public.
  const drafted = applyGuidedDraft(project, surveyAnswers({ sensitivity: 'species' }));
  assert.match(drafted.accessConstraints, /^Restricted/);
  assert.match(drafted.accessConstraints, /sensitive species/);

  // Changing the answer updates it again.
  const cultural = applyGuidedDraft(drafted, surveyAnswers({ sensitivity: 'cultural' }));
  assert.match(cultural.accessConstraints, /cultural resources/);

  // But wording the user wrote is theirs to keep.
  const custom = { ...project, accessConstraints: 'Ask the park data steward first.' };
  assert.equal(
    applyGuidedDraft(custom, surveyAnswers({ sensitivity: 'species' })).accessConstraints,
    'Ask the park data steward first.'
  );
});

test('methodology and lineage steps tell the same story', () => {
  const project = uploadedProject();
  const answers = surveyAnswers();
  const methodology = composeMethodology(project, answers);
  const steps = composeProcessSteps(project, answers);

  assert.match(methodology, /ArcGIS Field Maps and Survey123/);
  assert.equal(steps.length, 3);
  assert.match(steps[0].description, /ArcGIS Field Maps and Survey123/);
  // Every step is dated, which FGDC requires.
  for (const step of steps) assert.match(step.date, /^\d{8}$/);
  // Drafted steps are marked so the wizard can say so.
  assert.ok(steps.every((step) => step.draft));
});

test('collection dates become the time period of content', () => {
  const drafted = applyGuidedDraft(uploadedProject(), surveyAnswers());
  assert.equal(drafted.timePeriodType, 'range');
  assert.equal(drafted.beginDate, '20250315');
  assert.equal(drafted.endDate, '20250630');
  assert.equal(drafted.currentness, 'ground condition');
  assert.equal(drafted.updateFrequency, 'Annually');
});

test('a second pass does not overwrite what the user edited', () => {
  const project = uploadedProject();
  const first = applyGuidedDraft(project, surveyAnswers());
  const edited = { ...first, abstract: 'My own carefully written abstract.' };

  const second = applyGuidedDraft(edited, surveyAnswers());
  assert.equal(second.abstract, 'My own carefully written abstract.');

  const rewritten = applyGuidedDraft(edited, surveyAnswers(), { overwrite: true });
  assert.notEqual(rewritten.abstract, 'My own carefully written abstract.');
});

// -----------------------------------------------------------------------------
test('field definitions are suggested only where a name is unambiguous', () => {
  assert.match(suggestFieldDefinition('OBSERVER'), /person who recorded/);
  assert.match(suggestFieldDefinition('TORT_COUNT'), /Number of individuals/);
  assert.match(suggestFieldDefinition('Survey_Date'), /Date on which/);
  // A name that means nothing in general gets nothing.
  assert.equal(suggestFieldDefinition('HSI_Mean'), '');
  assert.equal(suggestFieldDefinition('Habitat_Category'), '');
});

test('suggested definitions are marked as drafts and counted', () => {
  const project = uploadedProject();
  project.fields.push(
    { ...project.fields[2], name: 'Observer', alias: 'Observer', definition: '', role: 'user', values: [], domainType: 'udom' },
    { ...project.fields[2], name: 'Notes', alias: 'Notes', definition: '', role: 'user', values: [], domainType: 'udom' }
  );

  // Survey_Date and ACRES already match patterns in the uploaded schema, so the
  // two added here bring the total to four.
  const { project: filled, filled: count } = applyFieldDefinitionDrafts(project);
  assert.equal(count, 4);
  assert.equal(countDraftDefinitions(filled), 4);
  for (const name of ['Observer', 'Notes', 'Survey_Date', 'ACRES']) {
    const target = filled.fields.find((f) => f.name === name);
    assert.ok(target.definitionDraft, `${name} was not marked as a draft`);
    assert.ok(target.definition, `${name} got no suggested definition`);
  }
  // Fields whose names mean nothing in general are left for the user.
  assert.equal(filled.fields.find((f) => f.name === 'HSI_Mean').definition, '');

  // Validation says so rather than letting boilerplate through unnoticed.
  const warnings = validateProject(filled).warnings.map((issue) => issue.message);
  assert.ok(warnings.some((message) => /still the suggested wording/.test(message)));

  // A definition a person wrote is never overwritten by a suggestion.
  const authored = { ...filled, fields: filled.fields.map((f) => (f.name === 'Observer' ? { ...f, definition: 'Mine.', definitionDraft: false } : f)) };
  assert.equal(applyFieldDefinitionDrafts(authored).filled, 0, 'a written definition was overwritten');
  assert.equal(authored.fields.find((f) => f.name === 'Observer').definition, 'Mine.');
});

// -----------------------------------------------------------------------------
test('a guided draft plus field definitions produces a compliant record', () => {
  let project = applyGuidedDraft(uploadedProject(), surveyAnswers(), { overwrite: true });
  project = applyFieldDefinitionDrafts(project).project;

  // The user still has to define the fields the tool could not name.
  for (const field of project.fields) {
    if (!field.definition) field.definition = `Meaning of the ${field.name} value.`;
    if (field.domainType === 'udom' && !field.udom) field.udom = 'Values are not enumerated.';
    for (const value of field.values) value.definition = value.definition || 'Defined class.';
  }

  const result = validateProject(project);
  assert.deepEqual(result.errors.map((issue) => issue.message), []);

  const xml = generateFgdcXml(project);
  const html = generateHtmlSnippet(project);
  assert.match(xml, /<abstract>/);
  assert.match(xml, /Restricted\. These data show locations of sensitive species/);
  assert.ok(xml.includes(NPS_USE_CONSTRAINTS));
  assert.match(html, /Death Valley National Park/);

  // House style holds in generated prose as much as in typed prose.
  for (const text of [project.abstract, project.purpose, project.summary, project.htmlCaution, project.htmlDataQuality]) {
    assert.deepEqual(findStyleIssues(text), [], `style issue in: ${text.slice(0, 60)}`);
  }
  assert.ok(!xml.includes('—') && !html.includes('—'));
});

test('every vocabulary entry carries the wording the composer needs', () => {
  for (const option of SENSITIVITY) {
    assert.ok(option.access, `${option.value} has no access statement`);
    if (option.value !== 'none') assert.ok(option.caution, `${option.value} has no caution`);
  }
  for (const limitation of LIMITATIONS) {
    assert.ok(limitation.quality, `${limitation.value} has no data quality text`);
    if (limitation.inCaution) assert.ok(limitation.caution, `${limitation.value} is flagged for the caution box but has none`);
  }
});
