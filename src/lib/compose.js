// =============================================================================
// THE GUIDED WRITER
// =============================================================================
// Turns a handful of answers into the prose an FGDC record and a Portal item
// need: abstract, purpose, summary, keywords, tags, use limitations, data
// quality, methodology, and draft lineage steps.
//
// It writes from two sources and invents nothing:
//
//   1. What the user answered, in their own words where they typed them.
//   2. What the upload already established: geometry, feature count, extent,
//      coordinate system, field names and aliases, domains.
//
// Everything it produces is a draft the user reviews on the normal wizard
// steps. Nothing here is written straight to a downloaded file without passing
// under their eyes, and the composer never asserts a fact it was not given.
// =============================================================================

import { clean, cleanLine, formatCount, toDisplayDate, toFgdcDate, splitList } from './text.js';
import {
  LAYER_KINDS, USES, METHODS, LIMITATIONS, SENSITIVITY,
  KEYWORD_HINTS, BASE_KEYWORDS, BASE_PLACE_KEYWORDS, suggestFieldDefinition
} from './vocabulary.js';
import { normalizeIsoTopic, DEFAULT_ACCESS_CONSTRAINTS } from './model.js';

/**
 * A blank answer set. Stored on the project so a draft can be revised rather
 * than re-answered.
 */
export function createGuidedAnswers(overrides = {}) {
  return {
    layerKind: 'field',
    subject: '',
    recordMeaning: '',
    uses: [],
    methods: [],
    collectedBy: '',
    collectionStart: '',
    collectionEnd: '',
    limitations: [],
    prohibited: '',
    sensitivity: 'none',
    updateCadence: 'As needed',
    extraNotes: '',
    ...overrides
  };
}

const lookup = (list, value) => list.find((item) => item.value === value) || null;
const lookupAll = (list, values) => (values || []).map((value) => lookup(list, value)).filter(Boolean);

/**
 * Join phrases into readable English: a, b and c.
 */
export function joinPhrases(items) {
  const parts = items.map((item) => cleanLine(item)).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The noun for one feature: "point", "polygon", "line", "record".
 */
function featureNoun(project, plural = false) {
  const geometry = String(project.geometryType || '').toLowerCase();
  const nouns = {
    point: 'point',
    multipoint: 'point',
    polyline: 'line',
    polygon: 'polygon'
  };
  const noun = project.dataType === 'Raster' ? 'cell' : (nouns[geometry] || 'record');
  return plural ? `${noun}s` : noun;
}

/**
 * The collection period as a readable phrase, or '' when no dates were given.
 */
function periodPhrase(answers) {
  const start = toFgdcDate(answers.collectionStart);
  const end = toFgdcDate(answers.collectionEnd);
  if (start && end && start !== end) return `between ${toDisplayDate(start)} and ${toDisplayDate(end)}`;
  if (start) return `in ${toDisplayDate(start)}`;
  if (end) return `in ${toDisplayDate(end)}`;
  return '';
}

/**
 * The user-facing fields worth naming in an abstract, by alias.
 */
function notableFields(project, limit = 4) {
  return (project.fields || [])
    .filter((field) => field.role === 'user')
    .map((field) => cleanLine(field.alias || field.name))
    .filter(Boolean)
    .slice(0, limit);
}

// -----------------------------------------------------------------------------
// Abstract
// -----------------------------------------------------------------------------

/**
 * "The data were collected in the field using Field Maps and Survey123, with
 * GPS receivers." One verb, however many methods were picked.
 */
function describeMethods(answers) {
  const methods = lookupAll(METHODS, answers.methods);
  if (!methods.length) return '';
  const [first, ...rest] = methods;
  const extras = rest.map((method) => method.fragment || method.phrase);
  const tail = extras.length ? `, ${joinPhrases(extras)}` : '';
  return cleanLine(`The data were ${first.phrase}${tail}.`);
}

/**
 * Three paragraphs: what it is, how it came to exist, what is in it.
 * This is the shape the standard asks for in Section 2.1 and the shape a
 * reviewer expects to read.
 */
export function composeAbstract(project, answers) {
  const subject = cleanLine(answers.subject);
  const meaning = cleanLine(answers.recordMeaning);
  const count = String(project.featureCount || '').replace(/[^0-9]/g, '');
  const noun = featureNoun(project, true);
  const kind = lookup(LAYER_KINDS, answers.layerKind);

  // --- Paragraph 1: what the dataset is -------------------------------------
  // The record meaning gets its own sentence. Folded into the first one it
  // produces "polygons representing one tortoise", which reads wrong.
  const first = [];
  first.push(count
    ? `This dataset contains ${formatCount(count)} ${noun} within Death Valley National Park.`
    : `This dataset contains ${noun} within Death Valley National Park.`);
  if (meaning) {
    first.push(`Each ${featureNoun(project)} represents ${meaning}.`);
  }
  if (subject && (!meaning || !meaning.toLowerCase().includes(subject.toLowerCase()))) {
    first.push(`The dataset documents ${subject}.`);
  }
  if (kind && kind.value === 'analysis') {
    first.push('It is a derived analysis product rather than a record of direct observation.');
  }

  // --- Paragraph 2: how it was made -----------------------------------------
  const second = [];
  const collector = cleanLine(answers.collectedBy);
  const period = periodPhrase(answers);

  // The first method carries the verb; the rest join as modifiers, so two
  // methods do not produce "collected ... and collected ...".
  const methodSentence = describeMethods(answers);
  if (methodSentence) second.push(methodSentence);

  // Who and when get their own sentence rather than being stacked onto the end
  // of the method clause, which otherwise runs on.
  if (collector && period) {
    second.push(cleanLine(`Collection was carried out by ${collector} ${period}.`));
  } else if (collector) {
    second.push(cleanLine(`Collection was carried out by ${collector}.`));
  } else if (period) {
    second.push(cleanLine(`Data were collected ${period}.`));
  }

  if (project.dataType !== 'Raster' && project.geometryType) {
    const crsNote = project.analysisCrsEpsg === '26911'
      ? ' in NAD 1983 UTM Zone 11N, the park working coordinate system'
      : '';
    second.push(cleanLine(`Features are stored as ${featureNoun(project, true)}${crsNote}.`));
  }

  // --- Paragraph 3: what is in it -------------------------------------------
  const third = [];
  const fields = notableFields(project);
  if (fields.length) {
    const userFieldCount = (project.fields || []).filter((field) => field.role === 'user').length;
    third.push(`Each record carries ${userFieldCount} attribute${userFieldCount === 1 ? '' : 's'}, including ${joinPhrases(fields)}.`);
  }
  const extent = cleanLine(project.extentDescription);
  if (extent) third.push(`Coverage is ${extent.replace(/\.$/, '')}.`);
  const extra = clean(answers.extraNotes);
  if (extra) third.push(extra);

  return [first, second, third]
    .map((paragraph) => paragraph.filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

// -----------------------------------------------------------------------------
// Purpose, summary, entity description
// -----------------------------------------------------------------------------

export function composePurpose(project, answers) {
  const uses = lookupAll(USES, answers.uses).map((use) => use.phrase);
  if (!uses.length) {
    return 'These data support resource management and planning at Death Valley National Park.';
  }
  const sentence = `These data support ${joinPhrases(uses)} at Death Valley National Park.`;
  const kind = lookup(LAYER_KINDS, answers.layerKind);
  if (kind && kind.value === 'analysis') {
    return `${sentence} The layer is intended to inform decisions at the planning scale rather than to substitute for field verification.`;
  }
  return sentence;
}

/**
 * The one-sentence Portal Summary field: content plus geographic scope.
 */
export function composeSummary(project, answers) {
  // The subject reads better after a count than the record meaning does:
  // "1,478 points of desert tortoise observations" rather than "of one tortoise
  // or burrow recorded during a survey transect".
  const meaning = cleanLine(answers.subject)
    || cleanLine(answers.recordMeaning).replace(/^(one|a|an|each)\s+/i, '');
  const count = String(project.featureCount || '').replace(/[^0-9]/g, '');
  const noun = featureNoun(project, true);
  const period = periodPhrase(answers);

  const head = count ? `${formatCount(count)} ${noun}` : noun.replace(/^\w/, (c) => c.toUpperCase());
  const body = meaning ? ` of ${meaning}` : '';
  const where = ' in Death Valley National Park';
  const when = period ? `, collected ${period}` : '';
  return cleanLine(`${head}${body}${where}${when}.`).replace(/^(\w)/, (c) => c.toUpperCase());
}

export function composeEntityDescription(project, answers) {
  const meaning = cleanLine(answers.recordMeaning);
  const noun = featureNoun(project);
  if (meaning) return `Each ${noun} represents ${meaning}.`;
  const subject = cleanLine(answers.subject);
  return subject ? `Each ${noun} records ${subject}.` : `Each ${noun} is one record in this dataset.`;
}

// -----------------------------------------------------------------------------
// Keywords, tags, ISO topic
// -----------------------------------------------------------------------------

/**
 * What the keyword matcher reads, in priority order. What the user typed about
 * this dataset outranks its title, which outranks its field names.
 *
 * The order matters: a layer named "..._Habitat" whose subject is "road
 * centerlines" is about roads. Pooling everything into one string let the
 * title win, and the topic category came out as biota.
 */
function keywordCorpora(project, answers) {
  return [
    [answers.subject, answers.recordMeaning].filter(Boolean).join(' '),
    [project.title, project.entityName, answers.extraNotes].filter(Boolean).join(' '),
    (project.fields || [])
      .filter((field) => field.role === 'user')
      .map((field) => `${field.name} ${field.alias}`)
      .join(' ')
  ].filter((text) => text && text.trim());
}

/**
 * Everything the matcher may look at, pooled. Used where breadth matters more
 * than precedence, such as gathering keywords.
 */
function keywordCorpus(project, answers) {
  return keywordCorpora(project, answers).join(' ');
}

/**
 * Theme keywords: the base DEVA set, plus matches from the vocabulary, plus
 * anything the answers themselves imply.
 */
export function suggestThemeKeywords(project, answers) {
  const corpus = keywordCorpus(project, answers);
  const keywords = [...BASE_KEYWORDS];

  for (const hint of KEYWORD_HINTS) {
    if (hint.match.test(corpus)) keywords.push(...hint.keywords);
  }

  const kind = lookup(LAYER_KINDS, answers.layerKind);
  if (kind) {
    if (kind.value === 'field') keywords.push('field survey');
    if (kind.value === 'analysis') keywords.push('spatial analysis');
    if (kind.value === 'boundary') keywords.push('boundaries');
    if (kind.value === 'facilities') keywords.push('facilities');
    if (kind.value === 'cultural') keywords.push('cultural resources');
  }
  for (const use of lookupAll(USES, answers.uses)) {
    if (use.value === 'nepa') keywords.push('NEPA');
    if (use.value === 'monitoring') keywords.push('monitoring');
  }
  // The subject the user typed is the best keyword there is.
  for (const word of splitList(answers.subject)) keywords.push(word.toLowerCase());

  const seen = new Set();
  return keywords
    .map((keyword) => cleanLine(keyword))
    .filter((keyword) => {
      const key = keyword.toLowerCase();
      if (!keyword || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function suggestPlaceKeywords(project) {
  const places = [...BASE_PLACE_KEYWORDS];
  // Nevada only when the extent actually reaches it: the state line runs near
  // longitude -116.5 at this latitude, and the park crosses it in the north.
  const east = Number(project.eastbc);
  if (Number.isFinite(east) && east > -116.4) places.push('Nevada');
  places.push('Mojave Desert');
  return places;
}

/**
 * ISO 19115 topic category: the vocabulary match wins, then the layer kind.
 */
export function suggestIsoTopic(project, answers) {
  // Only one topic category is allowed, so the most specific evidence wins:
  // what the user said this dataset is, before what the file happens to be
  // called.
  for (const corpus of keywordCorpora(project, answers)) {
    for (const hint of KEYWORD_HINTS) {
      if (hint.iso && hint.match.test(corpus)) return normalizeIsoTopic(hint.iso);
    }
  }
  const kind = lookup(LAYER_KINDS, answers.layerKind);
  return kind && kind.isoTopic ? normalizeIsoTopic(kind.isoTopic) : '';
}

/**
 * Portal tags, per Section 4.1: park unit, topic, NPS, data type, year.
 */
export function composeTags(project, answers) {
  const tags = ['DEVA', 'Death Valley National Park', 'NPS'];
  for (const keyword of suggestThemeKeywords(project, answers)) {
    if (!BASE_KEYWORDS.includes(keyword)) tags.push(keyword);
  }
  if (project.geometryType) tags.push(project.geometryType.toLowerCase());
  const year = toFgdcDate(project.pubdate).slice(0, 4);
  if (year) tags.push(year);

  const seen = new Set();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

// -----------------------------------------------------------------------------
// Constraints, quality, methodology, lineage
// -----------------------------------------------------------------------------

export function composeAccessConstraints(answers) {
  const sensitivity = lookup(SENSITIVITY, answers.sensitivity) || SENSITIVITY[0];
  return sensitivity.access;
}

/**
 * The yellow caution box: what people must not do with this layer.
 */
export function composeCaution(project, answers) {
  const parts = [];
  const typed = clean(answers.prohibited);
  if (typed) parts.push(typed.replace(/\s*$/, '').replace(/([^.])$/, '$1.'));
  const sensitivity = lookup(SENSITIVITY, answers.sensitivity);
  if (sensitivity && sensitivity.caution) parts.push(sensitivity.caution);
  // Only limitations that restrict what the layer may be used for belong here.
  // Accuracy and coverage caveats describe the data and are covered in Data
  // Quality; repeating them turns the caution box into a wall nobody reads.
  for (const limitation of lookupAll(LIMITATIONS, answers.limitations)) {
    if (limitation.inCaution && limitation.caution) parts.push(limitation.caution);
  }
  return parts.join(' ');
}

export function composeDataQuality(project, answers) {
  const parts = lookupAll(LIMITATIONS, answers.limitations).map((limitation) => limitation.quality);
  const collector = cleanLine(answers.collectedBy);
  const period = periodPhrase(answers);
  if (collector && period) {
    parts.unshift(`Data were collected by ${collector} ${period}.`);
  }
  return parts.join('\n\n');
}

/**
 * Methodology prose for the Portal description, written from the same answers
 * that produce the lineage steps so the two agree.
 */
export function composeMethodology(project, answers) {
  const methods = lookupAll(METHODS, answers.methods);
  if (!methods.length) return '';
  const collector = cleanLine(answers.collectedBy);
  const period = periodPhrase(answers);

  const opening = [
    describeMethods(answers),
    collector && period ? cleanLine(`Collection was carried out by ${collector} ${period}.`)
      : (collector ? cleanLine(`Collection was carried out by ${collector}.`)
        : (period ? cleanLine(`Data were collected ${period}.`) : ''))
  ].filter(Boolean).join(' ');
  const detail = methods.map((method) => method.step).join(' ');
  return `${opening}\n\n${detail}`;
}

/**
 * Draft lineage process steps. Dated from the collection period so they are
 * valid FGDC, and phrased so the user can sharpen them with tool names and
 * parameters, which is what Section 2.2 actually wants.
 */
export function composeProcessSteps(project, answers) {
  const methods = lookupAll(METHODS, answers.methods);
  const date = toFgdcDate(answers.collectionEnd)
    || toFgdcDate(answers.collectionStart)
    || toFgdcDate(project.pubdate);

  const steps = methods.map((method) => ({ description: method.step, date, draft: true }));
  if (steps.length) {
    steps.push({
      description: 'Reviewed geometry and attributes in ArcGIS Pro, corrected errors found in review, and published the layer to ArcGIS Portal as a hosted feature layer.',
      date: toFgdcDate(project.pubdate) || date,
      draft: true
    });
  }
  return steps;
}

// -----------------------------------------------------------------------------
// Whole-record draft
// -----------------------------------------------------------------------------

/**
 * Produce every piece of prose at once and return a new project with the drafts
 * applied. Fields the user has already written are left alone unless `overwrite`
 * is set, so running this twice does not throw away edits.
 */
export function applyGuidedDraft(project, answers, options = {}) {
  const { overwrite = false } = options;
  const next = { ...project, guided: { ...answers } };
  const keep = (existing, drafted) => (overwrite || !clean(existing) ? drafted : existing);

  next.abstract = keep(project.abstract, composeAbstract(project, answers));
  next.purpose = keep(project.purpose, composePurpose(project, answers));
  next.entityDescription = keep(project.entityDescription, composeEntityDescription(project, answers));
  next.summary = keep(project.summary, composeSummary(project, answers));
  next.portalTags = keep(project.portalTags, composeTags(project, answers));

  if (overwrite || !(project.themeKeywords || []).length) {
    next.themeKeywords = suggestThemeKeywords(project, answers);
  }
  if (overwrite || !(project.placeKeywords || []).length) {
    next.placeKeywords = suggestPlaceKeywords(project);
  }
  if (overwrite || !cleanLine(project.isoTopicCategory)) {
    next.isoTopicCategory = suggestIsoTopic(project, answers);
  }

  // Access constraints start out holding the default public statement, so the
  // usual "keep what is already there" rule would silently leave a sensitive
  // species dataset marked public. The answer wins unless the user has written
  // their own wording.
  const draftedAccess = composeAccessConstraints(answers);
  const accessIsUntouched = !clean(project.accessConstraints)
    || clean(project.accessConstraints) === clean(DEFAULT_ACCESS_CONSTRAINTS)
    || SENSITIVITY.some((option) => clean(option.access) === clean(project.accessConstraints));
  next.accessConstraints = (overwrite || accessIsUntouched)
    ? draftedAccess
    : project.accessConstraints;
  next.htmlCaution = keep(project.htmlCaution, composeCaution(project, answers));
  next.htmlDataQuality = keep(project.htmlDataQuality, composeDataQuality(project, answers));
  next.htmlMethodology = keep(project.htmlMethodology, composeMethodology(project, answers));

  if (cleanLine(answers.updateCadence)) next.updateFrequency = answers.updateCadence;

  // Time period of content, from the collection dates.
  const start = toFgdcDate(answers.collectionStart);
  const end = toFgdcDate(answers.collectionEnd);
  if (start && end && start !== end) {
    next.timePeriodType = 'range';
    next.beginDate = start;
    next.endDate = end;
    next.currentness = 'ground condition';
  } else if (start || end) {
    next.timePeriodType = 'single';
    next.calendarDate = start || end;
    next.currentness = 'ground condition';
  }

  // Lineage steps are only drafted when there are none, since a real one the
  // user wrote is worth more than anything generated here.
  if (overwrite || !(project.processSteps || []).length) {
    const drafted = composeProcessSteps(project, answers);
    if (drafted.length) next.processSteps = drafted;
  }

  return next;
}

/**
 * Draft definitions for fields that have none. Returns the number filled so the
 * user can be told, and marks each one so the wizard can show it as a draft.
 */
export function applyFieldDefinitionDrafts(project, answers = null) {
  let filled = 0;
  const fields = (project.fields || []).map((field) => {
    if (clean(field.definition) || field.role !== 'user') return field;
    const suggestion = suggestFieldDefinition(field.name);
    if (!suggestion) return field;
    filled += 1;
    return { ...field, definition: suggestion, definitionDraft: true };
  });
  return { project: { ...project, fields }, filled };
}

/**
 * How many field definitions are still the suggested wording. Surfaced as a
 * warning, because boilerplate that nobody read is what review catches.
 */
export function countDraftDefinitions(project) {
  return (project.fields || []).filter((field) => field.definitionDraft && clean(field.definition)).length;
}
