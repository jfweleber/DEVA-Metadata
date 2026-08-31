// =============================================================================
// UNIT TESTS
// =============================================================================
// Run with: npm test  (node --test, no dependencies)
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseXml, textAt, pickAll, textOf, descendants, buildDocument, buildElement, escapeXml } from '../src/lib/xml.js';
import { clean, toFgdcDate, toDisplayDate, humanizeFieldName, findStyleIssues, paragraphs } from '../src/lib/text.js';
import { crsByEpsg, crsByName, buildSpref, crsDisplay } from '../src/lib/crs.js';
import { createProject, createField, toFgdcType, classifyField, normalizeIsoTopic, NPS_USE_CONSTRAINTS } from '../src/lib/model.js';
import { importMetadataXml, stripMarkup } from '../src/lib/import.js';
import { generateFgdcXml, sdtsType, crsNoteFor, resolvedProcessSteps } from '../src/lib/fgdc.js';
import { generateHtmlSnippet } from '../src/lib/html.js';
import { validateProject, deliverableChecklist } from '../src/lib/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(join(here, '..', 'samples', 'pro-export-desert-tortoise.xml'), 'utf8');
const standard = readFileSync(join(here, '..', 'CLAUDE.md'), 'utf8');

/**
 * A project with every required value filled in, for tests that need a record
 * that actually passes validation.
 */
function completeProject() {
  const project = importMetadataXml(sampleXml, createProject());
  for (const field of project.fields) {
    if (!field.definition) field.definition = `Meaning of the ${field.name} value, described for a data user.`;
    if (field.domainType === 'udom' && !field.udom) field.udom = 'Values are not enumerated.';
  }
  project.sources = [{
    originator: 'Death Valley National Park',
    title: 'Desert tortoise habitat suitability index raster',
    pubdate: '20251101',
    scale: '30',
    typesrc: 'digital file',
    citationAbbrev: 'DEVA HSI',
    contribution: 'Source raster for the focal density analysis.',
    url: ''
  }];
  project.htmlCaution = 'Planning-level model output. Do not use for regulatory determinations.';
  return project;
}

// -----------------------------------------------------------------------------
test('XML parser handles entities, CDATA, comments and repeated elements', () => {
  const root = parseXml(`<?xml version="1.0"?><!-- note --><metadata>
    <idinfo><citation><citeinfo>
      <origin>NPS</origin><origin>GBI</origin>
      <title>Tortoise &amp; Habitat</title>
      <abstract><![CDATA[Raw <b>text</b>]]></abstract>
    </citeinfo></citation></idinfo></metadata>`);
  assert.equal(textAt(root, 'idinfo/citation/citeinfo/title'), 'Tortoise & Habitat');
  assert.deepEqual(pickAll(root, 'idinfo/citation/citeinfo/origin').map(textOf), ['NPS', 'GBI']);
  assert.equal(textAt(root, 'idinfo/citation/citeinfo/abstract'), 'Raw <b>text</b>');
});

test('XML parser reads namespaced ISO documents by local name', () => {
  const root = parseXml('<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd"><gmd:fileIdentifier><gco:CharacterString>abc</gco:CharacterString></gmd:fileIdentifier></gmd:MD_Metadata>');
  assert.equal(root.local, 'MD_Metadata');
  assert.equal(textAt(root, 'fileIdentifier/CharacterString'), 'abc');
});

test('XML writer escapes markup and drops empty elements', () => {
  const xml = buildDocument(['metadata', [['title', 'A & B <test>'], ['edition', ''], ['nested', [['empty', '']]]]]);
  assert.match(xml, /<title>A &amp; B &lt;test&gt;<\/title>/);
  assert.doesNotMatch(xml, /<edition>/);
  assert.doesNotMatch(xml, /<nested>/);
  assert.equal(escapeXml('a"b', true), 'a&quot;b');
});

// -----------------------------------------------------------------------------
test('house style strips em dashes and other characters Portal mangles', () => {
  assert.equal(clean('Habitat — core zones'), 'Habitat - core zones');
  assert.equal(clean('range 2.0–2.49'), 'range 2.0-2.49');
  assert.equal(clean('“quoted” and…'), '"quoted" and...');
  assert.deepEqual(findStyleIssues('a — b'), ['em dash']);
  assert.deepEqual(findStyleIssues('plain text'), []);
});

test('dates normalize to the FGDC compact form', () => {
  assert.equal(toFgdcDate('2026-02-04'), '20260204');
  assert.equal(toFgdcDate('20260204'), '20260204');
  assert.equal(toFgdcDate('2/4/2026'), '20260204');
  assert.equal(toFgdcDate('2026-02-04T00:00:00'), '20260204');
  assert.equal(toFgdcDate('not a date'), '');
  assert.equal(toDisplayDate('20260204'), 'February 4, 2026');
});

test('field names humanize into readable aliases', () => {
  assert.equal(humanizeFieldName('HABITAT_CATEGORY'), 'Habitat Category');
  assert.equal(humanizeFieldName('ShapeArea'), 'Shape Area');
  assert.equal(paragraphs('one\n\ntwo').length, 2);
});

// -----------------------------------------------------------------------------
test('coordinate systems resolve by EPSG and by ArcGIS name', () => {
  assert.equal(crsByEpsg('26911').label, 'NAD 1983 UTM Zone 11N');
  assert.equal(crsByName('NAD_1983_UTM_Zone_11N').epsg, '26911');
  assert.equal(crsByName('WGS_1984_Web_Mercator_Auxiliary_Sphere').epsg, '3857');
  assert.equal(crsByName('GCS_North_American_1983').epsg, '4269');
  // A datum-specific alias must not leak across datums, and unregistered zones
  // are still resolved rather than silently matching the geographic entry.
  assert.equal(crsByName('WGS_1984_UTM_Zone_11N').epsg, '32611');
  assert.equal(crsByName('NAD_1983_UTM_Zone_14N').epsg, '26914');
  assert.equal(crsByName('Nonsense'), null);
  assert.equal(crsDisplay(crsByEpsg('3857')), 'WGS 1984 Web Mercator Auxiliary Sphere (EPSG: 3857)');
});

test('spref carries the FGDC grid or projection parameters, not just a name', () => {
  const utm = buildElement(buildSpref(crsByEpsg('26911')));
  assert.match(utm, /<gridsysn>Universal Transverse Mercator<\/gridsysn>/);
  assert.match(utm, /<utmzone>11<\/utmzone>/);
  assert.match(utm, /<longcm>-117\.0<\/longcm>/);
  assert.match(utm, /<horizdn>North American Datum of 1983<\/horizdn>/);

  const geographic = buildElement(buildSpref(crsByEpsg('4326')));
  assert.match(geographic, /<geogunit>Decimal degrees<\/geogunit>/);
  assert.doesNotMatch(geographic, /<planar>/);

  // An unknown projection falls back to the standard's own escape hatch.
  const custom = buildElement(buildSpref({
    epsg: '99999', label: 'Imaginary Projection', kind: 'planar', datum: 'nad83', units: 'meters'
  }));
  assert.match(custom, /<otherprj>[^<]*Imaginary Projection/);
});

// -----------------------------------------------------------------------------
test('ArcGIS types map to the FGDC vocabulary and system fields are classified', () => {
  assert.equal(toFgdcType('esriFieldTypeDouble'), 'Double');
  assert.equal(toFgdcType('SmallInteger'), 'Integer');
  assert.equal(toFgdcType('OID'), 'OID');
  assert.equal(classifyField('OBJECTID'), 'system');
  assert.equal(classifyField('EditDate'), 'editor');
  assert.equal(classifyField('HABITAT'), 'user');
  assert.equal(normalizeIsoTopic('002'), 'biota');
  assert.equal(normalizeIsoTopic('biota'), 'biota');
});

test('numeric decimals default per type, and system fields keep their literal alias', () => {
  assert.equal(createField({ name: 'ACRES', type: 'Double' }).decimals, '6');
  assert.equal(createField({ name: 'COUNT', type: 'Integer' }).decimals, '0');
  assert.equal(createField({ name: 'NAME', type: 'String' }).decimals, '');
  assert.equal(createField({ name: 'OBJECTID', type: 'OID' }).alias, 'OBJECTID');
  assert.equal(createField({ name: 'OBJECTID', type: 'OID' }).includeInHtml, false);
});

// -----------------------------------------------------------------------------
test('the ArcGIS Pro export is read into a project', () => {
  const project = importMetadataXml(sampleXml, createProject());
  assert.equal(project.title, 'DEVA GIS Desert Tortoise Core Habitat');
  assert.equal(project.featureCount, '1478');
  assert.equal(project.geometryType, 'Polygon');
  assert.equal(project.analysisCrsEpsg, '26911');
  assert.equal(project.isoTopicCategory, 'biota');
  assert.equal(project.westbc, '-117.850000');
  assert.equal(project.fields.length, 8);
  assert.equal(project.processSteps.length, 2);
  assert.ok(project.editorTrackingPresent);

  // The abstract arrives wrapped in escaped ArcGIS markup and must come out as
  // clean paragraphs.
  assert.doesNotMatch(project.abstract, /<|&lt;/);
  assert.equal(paragraphs(project.abstract).length, 2);

  const habitat = project.fields.find((field) => field.name === 'Habitat_Category');
  assert.equal(habitat.domainType, 'edom');
  assert.equal(habitat.values.length, 2);
  const acres = project.fields.find((field) => field.name === 'ACRES');
  assert.equal(acres.domainType, 'rdom');
  assert.equal(acres.rangeMax, '18422.53');
  assert.equal(acres.units, 'acres');
});

test('system fields take the wording from Section 5.1, not the terser ArcGIS text', () => {
  const project = importMetadataXml(sampleXml, createProject());
  const objectid = project.fields.find((field) => field.name === 'OBJECTID');
  assert.match(objectid.definition, /System-assigned unique identifier/);
  assert.equal(objectid.definitionSource, 'ESRI');
  assert.equal(objectid.includeInHtml, false);
});

test('the importer reads a plain FGDC record too', () => {
  const project = importMetadataXml(generateFgdcXml(completeProject()), createProject());
  assert.equal(project.importSummary.format, 'FGDC CSDGM');
  assert.equal(project.title, 'DEVA GIS Desert Tortoise Core Habitat');
  assert.equal(project.fields.length, 7);
  assert.equal(project.sources.length, 1);
});

test('markup stripping preserves paragraph breaks', () => {
  assert.equal(stripMarkup('<P>one</P><P>two</P>'), 'one\n\ntwo');
});

// -----------------------------------------------------------------------------
test('generated FGDC XML is well formed and ordered per CSDGM', () => {
  const xml = generateFgdcXml(completeProject());
  const root = parseXml(xml);
  assert.equal(root.local, 'metadata');
  const order = root.children.filter((node) => node.type === 'element').map((node) => node.local);
  assert.deepEqual(order, ['idinfo', 'dataqual', 'spdoinfo', 'spref', 'eainfo', 'distinfo', 'metainfo']);

  const idinfoOrder = root.children.find((node) => node.local === 'idinfo')
    .children.filter((node) => node.type === 'element').map((node) => node.local);
  assert.deepEqual(idinfoOrder,
    ['citation', 'descript', 'timeperd', 'status', 'spdom', 'keywords', 'accconst', 'useconst', 'ptcontac', 'datacred']);
});

test('the NPS disclaimer is written verbatim, matching the standard document', () => {
  const expected = standard
    .split('### 2.6 NPS use constraints - paste verbatim into `<useconst>`')[1]
    .split('```')[1].trim();
  assert.equal(NPS_USE_CONSTRAINTS, expected);

  const root = parseXml(generateFgdcXml(completeProject()));
  assert.equal(textAt(root, 'idinfo/useconst'), expected);
  assert.equal(textAt(root, 'distinfo/distliab'), expected);
});

test('every attr carries the required sub-elements in the documented order', () => {
  const root = parseXml(generateFgdcXml(completeProject()));
  const attrs = descendants(root, 'attr');
  assert.ok(attrs.length >= 7);
  for (const attr of attrs) {
    const children = attr.children.filter((node) => node.type === 'element').map((node) => node.local);
    assert.deepEqual(children.slice(0, 3), ['attrlabl', 'attalias', 'attrtype']);
    for (const required of ['attwidth', 'attrdef', 'attrdefs', 'attrdomv']) {
      assert.ok(children.includes(required), `${textAt(attr, 'attrlabl')} missing ${required}`);
    }
    // atnumdec belongs to numeric types only.
    const type = textAt(attr, 'attrtype');
    const hasDecimals = children.includes('atnumdec');
    const numeric = ['Double', 'Single', 'Integer'].includes(type);
    assert.equal(hasDecimals, numeric, `${textAt(attr, 'attrlabl')} atnumdec placement`);
  }
});

test('enumerated values each get their own attrdomv block', () => {
  const root = parseXml(generateFgdcXml(completeProject()));
  const habitat = descendants(root, 'attr').find((attr) => textAt(attr, 'attrlabl') === 'Habitat_Category');
  const domains = habitat.children.filter((node) => node.local === 'attrdomv');
  assert.equal(domains.length, 2);
  for (const domain of domains) {
    assert.equal(descendants(domain, 'edom').length, 1);
    assert.ok(textAt(domain, 'edom/edomv'));
    assert.ok(textAt(domain, 'edom/edomvd'));
    assert.ok(textAt(domain, 'edom/edomvds'));
  }
});

test('editor tracking fields are kept out of the XML, system fields are kept in', () => {
  const root = parseXml(generateFgdcXml(completeProject()));
  const names = descendants(root, 'attr').map((attr) => textAt(attr, 'attrlabl'));
  assert.ok(names.includes('OBJECTID'));
  assert.ok(names.includes('Shape_Area'));
  assert.ok(!names.includes('EditDate'));
});

test('the final process step names both coordinate systems when they differ', () => {
  const project = completeProject();
  const note = crsNoteFor(project);
  assert.match(note, /EPSG 26911/);
  assert.match(note, /EPSG 3857/);
  const steps = resolvedProcessSteps(project);
  assert.match(steps[steps.length - 1].description, /per Portal hosting requirements/);
  // Only the last step carries it, and only once.
  assert.equal(steps.filter((step) => step.description.includes('per Portal hosting')).length, 1);

  // Matching coordinate systems produce no note at all.
  const single = { ...project, serviceCrsEpsg: '26911' };
  assert.equal(crsNoteFor(single), '');
});

test('geometry types map to the SDTS controlled vocabulary', () => {
  assert.equal(sdtsType('Polygon'), 'G-polygon');
  assert.equal(sdtsType('Polyline'), 'String');
  assert.equal(sdtsType('Point'), 'Entity point');
});

test('no em dashes survive into either artifact', () => {
  const project = completeProject();
  project.title = 'Tortoise Habitat — Core Zones';
  project.abstract = 'Paragraph one — with a dash.\n\nParagraph two.';
  project.processSteps[0].description = 'Reclassified — using the Reclassify tool.';
  const xml = generateFgdcXml(project);
  const html = generateHtmlSnippet(project);
  assert.ok(!xml.includes('—'), 'em dash in XML');
  assert.ok(!html.includes('—'), 'em dash in HTML');
  assert.match(xml, /Tortoise Habitat - Core Zones/);
});

// -----------------------------------------------------------------------------
test('the HTML snippet is a fragment with inline styles only', () => {
  const html = generateHtmlSnippet(completeProject());
  for (const forbidden of ['<html', '<head', '<body', '<style', '<script', 'class=']) {
    assert.ok(!html.toLowerCase().includes(forbidden), `snippet contains ${forbidden}`);
  }
  assert.match(html, /^<h1 style="/);
  assert.match(html, /color:rgb\(44, 95, 45\)/);
  assert.match(html, /border-bottom:2px solid rgb\(151, 188, 98\)/);
  assert.match(html, /background-color:#fff3cd; border-left:4px solid #ffc107/);
  assert.match(html, /<font size="2">/);
});

test('the HTML sections appear in the order the standard requires', () => {
  const project = completeProject();
  project.htmlClassification = { heading: 'Habitat Categories', intro: '', rows: [{ label: 'Optimal Core', description: 'Best habitat.' }] };
  project.htmlMethodology = 'Focal density analysis of the HSI raster.';
  project.htmlDataQuality = 'Source raster resampled to 30 m.';
  project.htmlReferences = ['Nussear et al. 2009.'];
  const html = generateHtmlSnippet(project);
  const headings = [...html.matchAll(/<font size="3">([^<]+)<\/font>/g)].map((match) => match[1]);
  assert.deepEqual(headings, [
    'Overview', 'Habitat Categories', 'Methodology', 'Attributes',
    'Use Limitations', 'Data Quality', 'Technical Specifications', 'References', 'Contact Information'
  ]);
});

test('system and editor tracking fields never reach the HTML attributes table', () => {
  const html = generateHtmlSnippet(completeProject());
  const table = html.split('Attributes</font></h2>')[1].split('</table>')[0];
  for (const hidden of ['OBJECTID', 'Shape_Area', 'Shape_Length', 'EditDate']) {
    assert.ok(!table.includes(hidden), `${hidden} leaked into the HTML table`);
  }
  assert.ok(table.includes('Habitat_Category'));
});

test('the HTML records both coordinate systems and the feature count', () => {
  const html = generateHtmlSnippet(completeProject());
  assert.match(html, /Coordinate System/);
  assert.match(html, /WGS 1984 Web Mercator Auxiliary Sphere \(EPSG: 3857\)/);
  assert.match(html, /Source Coordinate System/);
  assert.match(html, /NAD 1983 UTM Zone 11N \(EPSG: 26911\)/);
  assert.match(html, /1,478/);
  assert.match(html, /FGDC-STD-001-1998/);
});

test('the editor tracking note appears in the technical specifications', () => {
  const html = generateHtmlSnippet(completeProject());
  assert.match(html, /Editor tracking is enabled/);
});

// -----------------------------------------------------------------------------
test('a complete project validates clean', () => {
  const result = validateProject(completeProject());
  assert.deepEqual(result.errors.map((issue) => issue.message), []);
  assert.ok(result.ready);
  assert.deepEqual(deliverableChecklist(completeProject()).filter((item) => !item.pass), []);
});

test('validation catches a missing field definition', () => {
  const project = completeProject();
  project.fields.find((field) => field.name === 'ACRES').definition = '';
  const result = validateProject(project);
  assert.ok(result.errors.some((issue) => /ACRES.*definition/.test(issue.message)));
  assert.equal(result.ready, false);
});

test('validation catches a paraphrased disclaimer', () => {
  const project = completeProject();
  project.useConstraints = 'The Park Service is not liable for misuse of these data.';
  const result = validateProject(project);
  assert.ok(result.errors.some((issue) => /verbatim/.test(issue.message)));
});

test('validation catches a swapped or positive bounding box', () => {
  const project = completeProject();
  project.northbc = '35.0';
  project.southbc = '37.0';
  assert.ok(validateProject(project).errors.some((issue) => /swapped/.test(issue.message)));

  const positive = completeProject();
  positive.westbc = '117.85';
  positive.eastbc = '118.01';
  assert.ok(validateProject(positive).warnings.some((issue) => /Western hemisphere/.test(issue.message)));
});

test('validation warns when a system field is shown in the Portal table', () => {
  const project = completeProject();
  project.fields.find((field) => field.name === 'OBJECTID').includeInHtml = true;
  const result = validateProject(project);
  assert.ok(result.warnings.some((issue) => /OBJECTID.*system field/.test(issue.message)));
  assert.ok(deliverableChecklist(project).some((item) => !item.pass && /excluded from the HTML/.test(item.label)));
});

test('validation requires at least one dated process step', () => {
  const project = completeProject();
  project.processSteps = [];
  project.appendCrsNote = false;
  assert.ok(validateProject(project).errors.some((issue) => /process step/.test(issue.message)));
});
