// =============================================================================
// PORTAL HTML DESCRIPTION SNIPPET
// =============================================================================
// Produces the fragment that gets pasted into the Portal or AGOL item
// Description field through the HTML/Source editor. Constraints from Section 3
// of the DEVA standard are hard rules here:
//
//   - inline styles only, no <style>, no <script>, no wrapper tags
//   - every run of text wrapped in <font size="..."> for consistent rendering
//   - the green palette values exactly as specified
//   - system and editor tracking fields never appear in the attributes table
//   - no em dashes, which the text module strips on the way in
// =============================================================================

import { htmlText, clean, cleanLine, paragraphs, toDisplayDate, formatCount } from './text.js';
import { METADATA_STANDARD_NAME, METADATA_STANDARD_VERSION, EDITOR_TRACKING_NOTE } from './model.js';
import { crsByEpsg, crsDisplay, resolveCrs } from './crs.js';
import { documentedCrsFor } from './fgdc.js';

// Section 3.2 palette, written once so a change stays consistent.
const GREEN = 'rgb(44, 95, 45)';
const LIME = 'rgb(151, 188, 98)';

const STYLE = {
  h1: `font-weight:400; margin:24px 0px 12px; font-size:36px; line-height:1.1; color:${GREEN}; border-bottom:3px solid ${GREEN}; padding-bottom:10px;`,
  h2: `font-weight:400; margin:30px 0px 5px; font-size:18px; line-height:1.1; color:${GREEN}; border-bottom:2px solid ${LIME}; padding-bottom:5px;`,
  h3: `font-weight:400; margin:20px 0px 5px; font-size:16px; line-height:1.1; color:${GREEN};`,
  p: 'margin:12px 0px; font-size:14px; line-height:1.6;',
  table: 'width:100%; border-collapse:collapse; margin:15px 0; font-size:14px;',
  headRow: `background-color:${GREEN}; color:white;`,
  th: 'padding:8px 12px; text-align:left; border:1px solid #ddd;',
  td: 'padding:8px 12px; border:1px solid #ddd;',
  oddRow: 'background-color:#f9f9f9;',
  caution: 'background-color:#fff3cd; border-left:4px solid #ffc107; padding:10px; margin:15px 0;',
  note: 'background-color:#e9ecef; border-left:4px solid #6c757d; padding:10px; margin:15px 0;',
  approved: `background-color:#d4edda; border-left:4px solid ${GREEN}; padding:10px; margin:15px 0;`,
  footer: 'margin-top:30px; margin-bottom:1.5rem; font-size:14px; color:#666; text-align:center;'
};

const h1 = (text) => `<h1 style="${STYLE.h1}"><font size="4">${htmlText(text)}</font></h1>`;
const h2 = (text) => `<h2 style="${STYLE.h2}"><font size="3">${htmlText(text)}</font></h2>`;
const h3 = (text) => `<h3 style="${STYLE.h3}"><font size="2"><strong>${htmlText(text)}</strong></font></h3>`;
const para = (text) => `<p style="${STYLE.p}"><font size="2">${htmlText(text)}</font></p>`;
// Used where the cell content is already assembled markup rather than raw text.
const paraRaw = (markup) => `<p style="${STYLE.p}"><font size="2">${markup}</font></p>`;

const callout = (kind, label, text) =>
  `<div style="${STYLE[kind]}">\n<font size="2"><strong>${htmlText(label)}:</strong> ${htmlText(text)}</font>\n</div>`;

/**
 * Build a table from a header array and an array of row arrays. Cell values may
 * be pre-escaped markup, so callers escape their own text.
 */
function table(headers, rows) {
  if (!rows.length) return '';
  const head = `<tr style="${STYLE.headRow}">\n${headers
    .map((header) => `<th style="${STYLE.th}"><font size="2">${htmlText(header)}</font></th>`)
    .join('\n')}\n</tr>`;
  const body = rows.map((cells, index) => {
    const rowStyle = index % 2 === 0 ? ` style="${STYLE.oddRow}"` : '';
    const tds = cells
      .map((cell) => `<td style="${STYLE.td}"><font size="2">${cell}</font></td>`)
      .join('\n');
    return `<tr${rowStyle}>\n${tds}\n</tr>`;
  }).join('\n');
  return `<table style="${STYLE.table}">\n${head}\n${body}\n</table>`;
}

/**
 * The description cell for one attribute: the definition, plus a compact
 * summary of its domain so the reader knows what values to expect.
 */
function attributeDescription(field) {
  const definition = htmlText(field.definition);
  const extras = [];
  if (field.domainType === 'edom' && (field.values || []).length) {
    const values = field.values.map((entry) => cleanLine(entry.value)).filter(Boolean);
    if (values.length) extras.push(`<strong>Values:</strong> ${htmlText(values.join(', '))}`);
  } else if (field.domainType === 'rdom' && (field.rangeMin !== '' || field.rangeMax !== '')) {
    const units = field.units ? ` ${cleanLine(field.units)}` : '';
    extras.push(`<strong>Range:</strong> ${htmlText(`${field.rangeMin} to ${field.rangeMax}${units}`)}`);
  }
  // Only break the line when there is a definition above it to break from.
  const joined = [definition, ...extras].filter(Boolean).join('<br>');
  return joined;
}

function extentText(project) {
  const described = cleanLine(project.extentDescription);
  const hasBox = project.westbc && project.eastbc && project.northbc && project.southbc;
  if (!hasBox) return described;
  const box = `W ${project.westbc}, E ${project.eastbc}, N ${project.northbc}, S ${project.southbc} (decimal degrees)`;
  return described ? `${described}. Bounding box: ${box}` : `Bounding box: ${box}`;
}

/**
 * Generate the Portal description snippet. Returns a fragment with no wrapper
 * tags, ready to paste into the HTML/Source editor.
 */
export function generateHtmlSnippet(project) {
  const blocks = [];

  // --- Title ----------------------------------------------------------------
  blocks.push(h1(project.title));

  // --- Overview -------------------------------------------------------------
  const overviewSource = clean(project.htmlOverview) || clean(project.abstract);
  const overviewParagraphs = paragraphs(overviewSource);
  const purpose = clean(project.purpose);
  if (overviewParagraphs.length || purpose) {
    blocks.push(h2('Overview'));
    for (const paragraph of overviewParagraphs) blocks.push(para(paragraph));
    if (purpose && !overviewSource.includes(purpose)) {
      blocks.push(paraRaw(`<strong>Purpose:</strong> ${htmlText(purpose)}`));
    }
  }

  // --- Classification / Categories -----------------------------------------
  const classification = project.htmlClassification || {};
  const classificationRows = (classification.rows || [])
    .filter((row) => cleanLine(row.label) || clean(row.description));
  if (classificationRows.length) {
    blocks.push(h2(cleanLine(classification.heading) || 'Classification'));
    if (clean(classification.intro)) blocks.push(para(classification.intro));
    blocks.push(table(
      [cleanLine(classification.labelHeader) || 'Category', cleanLine(classification.descriptionHeader) || 'Definition'],
      classificationRows.map((row) => [htmlText(row.label), htmlText(row.description)])
    ));
  }

  // --- Methodology ----------------------------------------------------------
  const methodologyProse = paragraphs(project.htmlMethodology);
  const sources = (project.sources || []).filter((source) => cleanLine(source.title) || cleanLine(source.originator));
  const showSources = project.htmlIncludeMethodologySources && sources.length;
  if (methodologyProse.length || showSources) {
    blocks.push(h2('Methodology'));
    if (showSources) {
      blocks.push(h3('Data Sources'));
      blocks.push(table(
        ['Source', 'Originator', 'Date', 'Contribution'],
        sources.map((source) => [
          htmlText(source.title),
          htmlText(source.originator),
          htmlText(toDisplayDate(source.pubdate)),
          htmlText(source.contribution)
        ])
      ));
    }
    for (const paragraph of methodologyProse) blocks.push(para(paragraph));
  }

  // --- Attributes -----------------------------------------------------------
  // Section 5.1: system and editor tracking fields are documented in the XML
  // only, never in this table.
  const visibleFields = (project.fields || []).filter((field) => field.includeInHtml && field.role === 'user');
  if (visibleFields.length) {
    blocks.push(h2('Attributes'));
    blocks.push(table(
      ['Field Name', 'Description'],
      visibleFields.map((field) => [
        htmlText(field.alias && field.alias !== field.name ? `${field.alias} (${field.name})` : field.name),
        attributeDescription(field)
      ])
    ));
  }

  // --- Use Limitations ------------------------------------------------------
  blocks.push(h2('Use Limitations'));
  if (clean(project.htmlCaution)) blocks.push(callout('caution', 'Caution', project.htmlCaution));
  const noteText = clean(project.htmlNote)
    || 'These data are provided for planning and informational purposes. They are not a legal document and are not a substitute for field verification or survey-grade data.';
  blocks.push(callout('note', 'Note', noteText));

  // --- Data Quality ---------------------------------------------------------
  const dataQuality = paragraphs(project.htmlDataQuality);
  if (dataQuality.length) {
    blocks.push(h2('Data Quality'));
    for (const paragraph of dataQuality) blocks.push(para(paragraph));
  }

  // --- Technical Specifications --------------------------------------------
  blocks.push(h2('Technical Specifications'));
  const serviceCrs = documentedCrsFor(project);
  const analysisCrs = crsByEpsg(project.analysisCrsEpsg) || resolveCrs(project.customCrs);
  const specRows = [];
  specRows.push(['Feature Type', htmlText(project.dataType === 'Raster'
    ? 'Raster'
    : cleanLine(project.geometryType) || 'Vector')]);
  specRows.push(['Coordinate System', htmlText(crsDisplay(serviceCrs))]);
  if (analysisCrs && serviceCrs && analysisCrs.epsg && analysisCrs.epsg !== serviceCrs.epsg) {
    specRows.push(['Source Coordinate System', htmlText(crsDisplay(analysisCrs))]);
  }
  const extent = extentText(project);
  if (extent) specRows.push(['Extent', htmlText(extent)]);
  if (project.dataType === 'Raster') {
    if (project.rasterCellSize) specRows.push(['Spatial Resolution', htmlText(project.rasterCellSize)]);
    if (project.rasterRowCount && project.rasterColumnCount) {
      specRows.push(['Raster Size', htmlText(`${project.rasterColumnCount} columns by ${project.rasterRowCount} rows`)]);
    }
  } else if (project.featureCount) {
    specRows.push(['Feature Count', htmlText(formatCount(project.featureCount))]);
  }
  specRows.push(['Publication Date', htmlText(toDisplayDate(project.pubdate))]);
  specRows.push(['Update Frequency', htmlText(project.updateFrequency)]);
  blocks.push(table(['Parameter', 'Specification'], specRows));

  // Section 5.2: if editor tracking is on but undocumented, say so here.
  if (project.editorTrackingPresent
      && !(project.fields || []).some((field) => field.role === 'editor' && field.includeInXml)) {
    blocks.push(callout('note', 'Note', EDITOR_TRACKING_NOTE));
  }

  // --- References -----------------------------------------------------------
  const references = (project.htmlReferences || []).map(clean).filter(Boolean);
  if (references.length) {
    blocks.push(h2('References'));
    for (const reference of references) blocks.push(para(reference));
  }

  // --- Contact Information --------------------------------------------------
  const contact = project.contact || {};
  blocks.push(h2('Contact Information'));
  blocks.push([
    `<p style="${STYLE.p}">`,
    `<font size="2"><strong>${htmlText(contact.organization || 'Death Valley National Park')}</strong><br>`,
    `${htmlText(contact.address)}<br>`,
    `${htmlText(`${contact.city}, ${contact.state} ${contact.postal}`)}<br>`,
    `Phone: ${htmlText(contact.phone)}</font>`,
    '</p>'
  ].join('\n'));
  if (cleanLine(contact.person)) {
    const position = cleanLine(contact.position) ? `, ${htmlText(contact.position)}` : '';
    const email = cleanLine(contact.email)
      ? `<br>${htmlText(contact.email)}`
      : '';
    blocks.push(paraRaw(`<strong>GIS &amp; Data Questions:</strong> ${htmlText(contact.person)}${position}${email}`));
  }

  // --- Metadata footer ------------------------------------------------------
  blocks.push(`<h2 style="${STYLE.h2}"></h2>`);
  blocks.push([
    `<p style="${STYLE.footer}">`,
    `<font size="2"><span style="font-weight:600;">Metadata Date:</span> ${htmlText(toDisplayDate(project.metadataDate))}<br>`,
    `<span style="font-weight:600;">Metadata Standard:</span> ${htmlText(`${METADATA_STANDARD_NAME} (${METADATA_STANDARD_VERSION})`)}<br>`,
    `<span style="font-weight:600;">Created by:</span> ${htmlText(project.htmlCreatedBy)}</font>`,
    '</p>'
  ].join('\n'));

  return blocks.filter(Boolean).join('\n\n');
}

export { STYLE as HTML_STYLES };
