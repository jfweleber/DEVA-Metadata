// =============================================================================
// XML WORKSPACE DOCUMENT TESTS
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseWorkspaceDefinition, datasetToProject, fieldsFromDataset, describeDataset } from '../src/lib/workspace.js';
import { createWorkspaceDataScanner, scanWorkspaceData } from '../src/lib/workspace-data.js';
import { readWorkspaceDocument, stringChunks } from '../src/lib/workspace-reader.js';
import { detectDocumentKind, importMetadataXml } from '../src/lib/import.js';
import { createProject } from '../src/lib/model.js';
import { crsByEpsg, toGeographic, extentToBoundingBox } from '../src/lib/crs.js';
import { generateFgdcXml } from '../src/lib/fgdc.js';
import { generateHtmlSnippet } from '../src/lib/html.js';
import { validateProject } from '../src/lib/validate.js';
import { parseXml, textAt, descendants } from '../src/lib/xml.js';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceXml = readFileSync(join(here, '..', 'samples', 'workspace-export-tortoise.xml'), 'utf8');
const metadataXml = readFileSync(join(here, '..', 'samples', 'pro-export-desert-tortoise.xml'), 'utf8');

const featureClassName = 'DEVA_GIS_Desert_Tortoise_Core_Habitat';

function loadFeatureClass() {
  const parsed = parseWorkspaceDefinition(workspaceXml);
  const dataset = parsed.datasets.find((item) => item.name === featureClassName);
  const stats = scanWorkspaceData(workspaceXml)[featureClassName];
  return { parsed, dataset, stats };
}

// -----------------------------------------------------------------------------
// Format routing
// -----------------------------------------------------------------------------
test('the two export types are told apart from the head of the file', () => {
  assert.equal(detectDocumentKind(workspaceXml), 'workspace');
  assert.equal(detectDocumentKind(metadataXml), 'metadata');
  assert.equal(detectDocumentKind('<html><body>nope</body></html>'), 'unknown');
  // Only the head is needed, which is what lets a huge export be classified
  // without reading it.
  assert.equal(detectDocumentKind(workspaceXml.slice(0, 500)), 'workspace');
});

// -----------------------------------------------------------------------------
// Definition
// -----------------------------------------------------------------------------
test('the workspace definition yields every dataset with its schema', () => {
  const { parsed } = loadFeatureClass();
  assert.equal(parsed.datasets.length, 2);

  const featureClass = parsed.datasets[0];
  assert.equal(featureClass.name, featureClassName);
  assert.equal(featureClass.kind, 'FeatureClass');
  assert.equal(featureClass.geometryType, 'Polygon');
  assert.equal(featureClass.alias, 'Desert Tortoise Core Habitat');
  assert.equal(featureClass.fields.length, 12);
  assert.equal(featureClass.spatialReference.crs.epsg, '26911');

  const table = parsed.datasets[1];
  assert.equal(table.kind, 'Table');
  assert.ok(table.embeddedMetadata.includes('DEVA Tortoise Survey Events'));
});

test('editor tracking fields come from the declaration, not from their names', () => {
  const { dataset } = loadFeatureClass();
  const tracking = dataset.fields.filter((field) => field.isEditorTracking).map((field) => field.name);
  assert.deepEqual(tracking.sort(), ['CreationDate', 'Creator', 'EditDate', 'Editor']);
});

test('coded value and range domains are read, inline and by reference', () => {
  const { dataset } = loadFeatureClass();
  // Declared inline on the field.
  const category = dataset.fields.find((field) => field.name === 'Habitat_Category');
  assert.equal(category.domain.kind, 'coded');
  assert.deepEqual(category.domain.values.map((value) => value.value), ['MOD', 'OPT']);
  // Referenced by name from the workspace-level domain list.
  const hsi = dataset.fields.find((field) => field.name === 'HSI_Mean');
  assert.equal(hsi.domain.kind, 'range');
  assert.equal(hsi.domain.min, '0');
  assert.equal(hsi.domain.max, '3');
});

test('a geodatabase domain becomes the matching FGDC domain', () => {
  const { dataset, stats } = loadFeatureClass();
  const fields = fieldsFromDataset(dataset, stats);

  const category = fields.find((field) => field.name === 'Habitat_Category');
  assert.equal(category.domainType, 'edom');
  assert.deepEqual(category.values.map((value) => value.value), ['MOD', 'OPT']);
  // The coded value name is what the code means, which is the FGDC definition.
  assert.equal(category.values[0].definition, 'Moderate Core');

  const hsi = fields.find((field) => field.name === 'HSI_Mean');
  assert.equal(hsi.domainType, 'rdom');
  assert.equal(hsi.rangeMin, '0');
  assert.equal(hsi.rangeMax, '3');
});

// -----------------------------------------------------------------------------
// Data scanning
// -----------------------------------------------------------------------------
test('the data scan counts records and measures values', () => {
  const stats = scanWorkspaceData(workspaceXml);
  assert.equal(stats[featureClassName].recordCount, 4);
  assert.equal(stats.DEVA_Tortoise_Survey_Events.recordCount, 2);

  const acres = stats[featureClassName].fields.ACRES;
  assert.equal(acres.min, 0.01);
  assert.equal(acres.max, 18422.53);
  assert.equal(acres.count, 4);

  const category = stats[featureClassName].fields.Habitat_Category;
  assert.deepEqual(category.distinct, ['MOD', 'OPT']);

  const dates = stats[featureClassName].fields.Survey_Date;
  assert.equal(dates.dateMin.slice(0, 10), '2025-04-11');
  assert.equal(dates.dateMax.slice(0, 10), '2025-05-19');

  // Geometry is skipped rather than aggregated.
  assert.equal(stats[featureClassName].fields.Shape, undefined);
});

test('the scan gives the same answer at any chunk size', () => {
  const reference = scanWorkspaceData(workspaceXml, 1 << 20);
  // Small chunks force records, field lists and dataset boundaries to straddle
  // chunk edges, which is where a streaming reader goes wrong.
  for (const chunkSize of [1, 7, 64, 997, 4096]) {
    const scanner = createWorkspaceDataScanner();
    for (let offset = 0; offset < workspaceXml.length; offset += chunkSize) {
      scanner.push(workspaceXml.slice(offset, offset + chunkSize));
    }
    const stats = scanner.finish();
    assert.deepEqual(stats, reference, `chunk size ${chunkSize} disagreed`);
  }
});

test('a dataset with no data section reports no records', () => {
  const schemaOnly = `${workspaceXml.slice(0, workspaceXml.indexOf('<WorkspaceData'))}</esri:Workspace>`;
  assert.deepEqual(scanWorkspaceData(schemaOnly), {});
});

// -----------------------------------------------------------------------------
// Streaming reader
// -----------------------------------------------------------------------------
test('the streaming reader returns definition and statistics together', async () => {
  const document = await readWorkspaceDocument(stringChunks(workspaceXml, 512));
  assert.equal(document.datasets.length, 2);
  assert.equal(document.includesData, true);
  assert.equal(document.stats[featureClassName].recordCount, 4);
});

test('the streaming reader handles a schema-only export', async () => {
  const schemaOnly = `${workspaceXml.slice(0, workspaceXml.indexOf('<WorkspaceData'))}</esri:Workspace>`;
  const document = await readWorkspaceDocument(stringChunks(schemaOnly, 512));
  assert.equal(document.datasets.length, 2);
  assert.equal(document.includesData, false);
});

test('a file that is not a workspace document is refused clearly', async () => {
  await assert.rejects(
    () => readWorkspaceDocument(stringChunks('<metadata><idinfo/></metadata>')),
    /WorkspaceDefinition/
  );
});

// -----------------------------------------------------------------------------
// Reprojection
// -----------------------------------------------------------------------------
test('projected coordinates convert to decimal degrees', () => {
  const utm = crsByEpsg('26911');
  // On the central meridian the longitude is exact by construction.
  const middle = toGeographic(500000, 4000000, utm);
  assert.equal(Number(middle.longitude.toFixed(6)), -117);
  assert.ok(Math.abs(middle.latitude - 36.1447181) < 1e-5);

  // Checked against pyproj for EPSG:26911 to EPSG:4269.
  const point = toGeographic(511268, 4036229, utm);
  assert.ok(Math.abs(point.latitude - 36.4712736) < 1e-6, `latitude was ${point.latitude}`);
  assert.ok(Math.abs(point.longitude - -116.8742247) < 1e-6, `longitude was ${point.longitude}`);

  const web = toGeographic(-13024380.7, 4300621.4, crsByEpsg('3857'));
  assert.ok(Math.abs(web.longitude - -117) < 1e-5);
  assert.ok(Math.abs(web.latitude - 36) < 1e-5);
});

test('a bounding box contains the whole projected extent', () => {
  const box = extentToBoundingBox(
    { xmin: 452113.4823, ymin: 3985221.6608, xmax: 612884.9177, ymax: 4118330.2241 },
    crsByEpsg('26911')
  );
  // Reference computed with pyproj by walking the edges of the rectangle.
  assert.ok(box.westbc <= -117.539683, `west ${box.westbc}`);
  assert.ok(box.eastbc >= -115.727900, `east ${box.eastbc}`);
  assert.ok(box.northbc >= 37.211455, `north ${box.northbc}`);
  assert.ok(box.southbc <= 36.004939, `south ${box.southbc}`);
  // And is not absurdly generous about it.
  assert.ok(box.northbc - 37.211455 < 0.0001);
});

test('an unsupported projection returns nothing rather than a wrong answer', () => {
  // Albers is not invertible here, so the extent must not be converted.
  assert.equal(extentToBoundingBox({ xmin: 0, ymin: 0, xmax: 1, ymax: 1 }, crsByEpsg('5070')), null);
  assert.equal(toGeographic(0, 0, crsByEpsg('5070')), null);
});

// -----------------------------------------------------------------------------
// Dataset to project
// -----------------------------------------------------------------------------
test('a workspace dataset becomes a project with schema facts filled in', () => {
  const { dataset, stats } = loadFeatureClass();
  const project = datasetToProject(dataset, { stats, base: createProject() });

  assert.equal(project.entityName, featureClassName);
  assert.equal(project.title, 'Desert Tortoise Core Habitat');
  assert.equal(project.geometryType, 'Polygon');
  assert.equal(project.dataType, 'Vector');
  assert.equal(project.analysisCrsEpsg, '26911');
  assert.equal(project.featureCount, '4');
  assert.equal(project.fields.length, 12);
  assert.ok(project.editorTrackingPresent);
  assert.ok(Number(project.westbc) < 0 && Number(project.northbc) > 0);
});

test('observed values fill a numeric domain but never declare a text vocabulary', () => {
  const { dataset, stats } = loadFeatureClass();
  const fields = datasetToProject(dataset, { stats }).fields;

  // A number with no declared domain gets the measured range.
  const acres = fields.find((field) => field.name === 'ACRES');
  assert.equal(acres.domainType, 'rdom');
  assert.equal(acres.rangeMin, '0.01');
  assert.equal(acres.rangeMax, '18422.53');
  assert.equal(acres.rangeFromData, true);

  // Text values are offered, not applied: four observed names are not proof of
  // a controlled vocabulary.
  const creator = fields.find((field) => field.name === 'Creator');
  assert.equal(creator.domainType, 'udom');
  assert.deepEqual(creator.observed.distinct, ['jweleber', 'rsmith']);

  // System fields keep the standard wording rather than a measured range.
  const shapeArea = fields.find((field) => field.name === 'Shape_Area');
  assert.equal(shapeArea.domainType, 'udom');
  assert.equal(shapeArea.role, 'system');
});

test('metadata embedded in the export is merged with the schema', () => {
  const parsed = parseWorkspaceDefinition(workspaceXml);
  const table = parsed.datasets.find((item) => item.name === 'DEVA_Tortoise_Survey_Events');
  const metadataProject = importMetadataXml(table.embeddedMetadata, createProject());
  const project = datasetToProject(table, {
    stats: scanWorkspaceData(workspaceXml).DEVA_Tortoise_Survey_Events,
    metadataProject
  });

  // Words come from the metadata.
  assert.equal(project.title, 'DEVA Tortoise Survey Events');
  assert.match(project.abstract, /Field survey events/);
  // Schema facts come from the workspace, which is the ground truth.
  assert.equal(project.fields.length, 3);
  assert.equal(project.featureCount, '2');
  assert.ok(project.importSummary.found.includes('Metadata embedded in the export'));
});

test('the summary says what was read and what still has to be answered', () => {
  const { dataset, stats } = loadFeatureClass();
  const summary = datasetToProject(dataset, { stats }).importSummary;
  assert.equal(summary.format, 'ArcGIS XML Workspace Document');
  assert.ok(summary.found.some((item) => /Feature count \(4/.test(item)));
  assert.ok(summary.found.some((item) => /Bounding coordinates/.test(item)));
  assert.ok(summary.found.some((item) => /Editor tracking/.test(item)));
  // A geodatabase nobody documented cannot supply these.
  assert.ok(summary.missing.some((item) => /Title, abstract/.test(item)));
  assert.ok(summary.fieldsMissingDefinition.includes('ACRES'));
});

test('describeDataset summarizes a dataset for the picker', () => {
  const { dataset, stats } = loadFeatureClass();
  const description = describeDataset(dataset, stats);
  assert.match(description, /Polygon/);
  assert.match(description, /12 fields/);
  assert.match(description, /4 records/);
  assert.match(description, /EPSG: 26911/);
});

// -----------------------------------------------------------------------------
// End to end
// -----------------------------------------------------------------------------
test('a workspace with no metadata still produces both artifacts', () => {
  const { dataset, stats } = loadFeatureClass();
  const project = datasetToProject(dataset, { stats, base: createProject() });

  // Fill in only what a person must supply, as the wizard would.
  project.abstract = 'Core habitat polygons for desert tortoise within Death Valley National Park, derived from focal density analysis of habitat suitability model outputs across the park.';
  project.purpose = 'Supports NEPA analysis and consultation for actions that may affect desert tortoise habitat.';
  project.themeKeywords = ['desert tortoise', 'habitat'];
  project.isoTopicCategory = 'biota';
  project.processSteps = [{ description: 'Ran Focal Statistics with a 450 meter neighborhood.', date: '20260121' }];
  for (const field of project.fields) {
    if (!field.definition) field.definition = `Meaning of the ${field.name} value.`;
    if (field.domainType === 'udom' && !field.udom) field.udom = 'Values are not enumerated.';
    for (const value of field.values) value.definition = value.definition || 'Defined class.';
  }

  const result = validateProject(project);
  assert.deepEqual(result.errors.map((issue) => issue.message), []);

  const xml = generateFgdcXml(project);
  const root = parseXml(xml);
  assert.equal(textAt(root, 'spdoinfo/ptvctinf/sdtsterm/ptvctcnt'), '4');
  assert.equal(textAt(root, 'spdoinfo/ptvctinf/sdtsterm/sdtstype'), 'G-polygon');
  assert.equal(textAt(root, 'idinfo/spdom/bounding/westbc'), String(project.westbc));

  // The domains carried across from the geodatabase survive into the record.
  const category = descendants(root, 'attr').find((attr) => textAt(attr, 'attrlabl') === 'Habitat_Category');
  const domains = category.children.filter((node) => node.local === 'attrdomv');
  assert.equal(domains.length, 2);
  assert.equal(textAt(domains[0], 'edom/edomv'), 'MOD');

  // Editor tracking fields stay out of both artifacts.
  const names = descendants(root, 'attr').map((attr) => textAt(attr, 'attrlabl'));
  assert.ok(!names.includes('EditDate'));
  const html = generateHtmlSnippet(project);
  const attributeTable = html.split('Attributes</font></h2>')[1].split('</table>')[0];
  for (const hidden of ['Creator', 'EditDate', 'OBJECTID', 'Shape_Area']) {
    assert.ok(!attributeTable.includes(hidden), `${hidden} leaked into the HTML table`);
  }
  assert.match(attributeTable, /Habitat_Category/);
  // The editor tracking fields are named once, in the note Section 5.2 asks for.
  assert.match(html, /Editor tracking is enabled/);
  assert.ok(!html.includes('—'));
});
