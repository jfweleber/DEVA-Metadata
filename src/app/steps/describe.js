// =============================================================================
// STEP 2: DESCRIBE (THE GUIDED WRITER)
// =============================================================================
// The step that exists so staff do not have to write metadata prose. They
// answer a page of mostly pick-list questions, and the tool drafts the
// abstract, purpose, summary, keywords, tags, constraints, data quality,
// methodology and lineage steps from those answers plus what the upload
// already established.
//
// Everything drafted here is editable on the steps that follow. Nothing is
// asserted that the user did not answer or the file did not contain.
// =============================================================================

import { el, toast, setChildren } from '../dom.js';
import { state, setStep } from '../store.js';
import { field, group, commit } from '../controls.js';
import { createGuidedAnswers, applyGuidedDraft, applyFieldDefinitionDrafts } from '../../lib/compose.js';
import { LAYER_KINDS, USES, METHODS, LIMITATIONS, SENSITIVITY } from '../../lib/vocabulary.js';
import { clean, toInputDate, toFgdcDate } from '../../lib/text.js';

const UPDATE_FREQUENCIES = [
  'As needed', 'Annually', 'Semiannually', 'Quarterly', 'Monthly',
  'Irregular', 'None planned', 'Unknown'
];

/**
 * A checkbox list bound to an array of option values on the answers object.
 */
function optionList(answers, key, options, columns = 2) {
  const wrapper = el('div', { class: columns === 2 ? 'grid-2' : '' });
  for (const option of options) {
    const input = el('input', {
      type: 'checkbox',
      checked: (answers[key] || []).includes(option.value)
    });
    input.addEventListener('change', () => {
      const current = new Set(answers[key] || []);
      if (input.checked) current.add(option.value);
      else current.delete(option.value);
      // Keep the declared order rather than click order, so generated prose
      // reads the same way for everyone.
      answers[key] = options.filter((item) => current.has(item.value)).map((item) => item.value);
      commit();
    });
    wrapper.append(el('label', { class: 'checkbox' }, [
      input,
      el('span', {}, [
        el('span', { text: option.label }),
        option.hint ? el('span', { class: 'hint', text: option.hint }) : null
      ])
    ]));
  }
  return wrapper;
}

/**
 * Text input bound to the answers object rather than the project root.
 */
function answerInput(answers, key, options = {}) {
  const node = options.multiline
    ? el('textarea', { rows: options.rows || 3, placeholder: options.placeholder || '' })
    : el('input', { type: options.type || 'text', placeholder: options.placeholder || '' });
  node.value = answers[key] ?? '';
  node.addEventListener('input', () => {
    answers[key] = node.value;
    commit();
  });
  return node;
}

function answerDate(answers, key) {
  const node = el('input', { type: 'date', value: toInputDate(answers[key]) });
  node.addEventListener('input', () => {
    answers[key] = node.value ? toFgdcDate(node.value) : '';
    commit();
  });
  return node;
}

function answerSelect(answers, key, options) {
  const node = el('select', {}, options.map((option) => el('option', {
    value: option.value,
    text: option.label,
    selected: String(answers[key]) === String(option.value)
  })));
  node.addEventListener('change', () => {
    answers[key] = node.value;
    commit();
  });
  return node;
}

/**
 * What the draft filled in, shown after generating so the user can see the tool
 * did something and go straight to reviewing it.
 */
function draftReport(before, after, definitionsFilled, context) {
  const wrote = [];
  const changed = (key, label) => {
    if (clean(after[key]) && clean(after[key]) !== clean(before[key])) wrote.push(label);
  };
  changed('abstract', 'Abstract');
  changed('purpose', 'Purpose');
  changed('summary', 'Portal summary');
  changed('portalTags', 'Portal tags');
  changed('entityDescription', 'Entity description');
  changed('accessConstraints', 'Access constraints');
  changed('htmlCaution', 'Use limitations');
  changed('htmlDataQuality', 'Data quality');
  changed('htmlMethodology', 'Methodology');
  if ((after.themeKeywords || []).length !== (before.themeKeywords || []).length) wrote.push('Theme keywords');
  if (after.isoTopicCategory !== before.isoTopicCategory) wrote.push('ISO topic category');
  if ((after.processSteps || []).length !== (before.processSteps || []).length) wrote.push('Draft lineage steps');
  if (definitionsFilled) wrote.push(`${definitionsFilled} field definition${definitionsFilled === 1 ? '' : 's'}`);

  return el('div', { class: 'callout ok' }, [
    el('p', { html: `<strong>Draft written.</strong> ${wrote.length ? wrote.join(', ') + '.' : 'Nothing needed changing.'}` }),
    el('p', {
      class: 'hint',
      text: 'All of it is editable on the steps that follow. Read the abstract before you download: it is written from your answers, and it is your name on the record.'
    }),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;' }, [
      el('button', { type: 'button', text: 'Review the abstract', on: { click: () => setStep('identification') } }),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Review the field definitions',
        on: { click: () => setStep('attributes') }
      })
    ])
  ]);
}

export function render(context) {
  const project = state.project;
  if (!project.guided) project.guided = createGuidedAnswers();
  const answers = project.guided;
  const reportHolder = el('div', {});

  const generate = (overwrite) => {
    const before = { ...project, fields: (project.fields || []).map((item) => ({ ...item })) };
    let next = applyGuidedDraft(project, answers, { overwrite });
    const withDefinitions = applyFieldDefinitionDrafts(next);
    next = withDefinitions.project;

    // The project is updated in place rather than replaced. Replacing it
    // notifies a project change, which redraws this panel and throws away the
    // report element before it can be filled in.
    Object.assign(state.project, next);
    commit();

    setChildren(reportHolder, [draftReport(before, state.project, withDefinitions.filled, context)]);
    writeButton.textContent = 'Rewrite from these answers';
    toast('Draft written');
    reportHolder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const hasDraft = Boolean(clean(project.abstract));
  const writeButton = el('button', {
    type: 'button',
    text: hasDraft ? 'Rewrite from these answers' : 'Write the draft',
    on: { click: () => generate(Boolean(clean(state.project.abstract))) }
  });

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Describe the layer' }),
    el('p', {
      class: 'panel-intro',
      text: 'Answer these and the tool writes the abstract, purpose, summary, keywords, tags, use limitations, data quality and a first pass at the lineage. Most of it is picking from lists. You review and edit everything afterwards.'
    }),

    group('What is it', [
      field('What kind of layer is this?', answerSelect(answers, 'layerKind', LAYER_KINDS),
        'This shapes the wording and the suggested topic category.'),
      field('What is the subject, in a few words?', answerInput(answers, 'subject', {
        placeholder: 'desert tortoise observations'
      }), 'Used in the abstract, the summary and the keywords. Plain words, the way you would say it out loud.'),
      field('What does one record represent?', answerInput(answers, 'recordMeaning', {
        placeholder: 'one tortoise or burrow recorded during a survey transect'
      }), 'Finish the sentence "each point represents...". This becomes the entity description as well.')
    ]),

    group('What is it for', [
      el('p', { class: 'hint', text: 'Pick everything that applies. These become the purpose statement.' }),
      optionList(answers, 'uses', USES)
    ]),

    group('Where it came from', [
      el('p', { class: 'hint', text: 'How the data were produced. These become the methodology text and a first draft of the lineage process steps.' }),
      optionList(answers, 'methods', METHODS.map((method) => ({ value: method.value, label: method.label }))),
      field('Who collected or produced it?', answerInput(answers, 'collectedBy', {
        placeholder: 'the DEVA Resource Management division with Great Basin Institute crews'
      }), 'The division, program or partner. Used in the abstract and the data quality section.'),
      el('div', { class: 'grid-2' }, [
        field('Collection started', answerDate(answers, 'collectionStart')),
        field('Collection ended', answerDate(answers, 'collectionEnd'))
      ]),
      el('p', { class: 'hint', text: 'These also set the time period of content, which FGDC requires.' })
    ]),

    group('What are its limits', [
      el('p', { class: 'hint', text: 'Being honest here is what reviewers look for. These become the data quality section, and the ones that restrict use also go in the yellow caution box.' }),
      optionList(answers, 'limitations', LIMITATIONS.map((limitation) => ({ value: limitation.value, label: limitation.label }))),
      field('Anything users must not do with it?', answerInput(answers, 'prohibited', {
        multiline: true,
        rows: 2,
        placeholder: 'Do not use these locations to site infrastructure without a current field survey.'
      }), 'Goes at the top of the caution box, in your words.')
    ]),

    group('Sensitivity and upkeep', [
      field('Does it show sensitive locations?', answerSelect(answers, 'sensitivity', SENSITIVITY),
        'Changes the access constraints. Confirm the wording with the park data steward before publishing anything restricted.'),
      field('How often will it be updated?', answerSelect(answers, 'updateCadence',
        UPDATE_FREQUENCIES.map((value) => ({ value, label: value })))),
      field('Anything else a user should know?', answerInput(answers, 'extraNotes', {
        multiline: true,
        rows: 2,
        placeholder: 'Optional. Added to the end of the abstract in your words.'
      }))
    ]),

    el('div', { class: 'actions' }, [
      writeButton,
      hasDraft ? el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Fill only what is still empty',
        on: { click: () => generate(false) }
      }) : null
    ]),
    hasDraft ? el('p', {
      class: 'hint',
      text: 'Rewriting replaces the drafted text with a fresh version from these answers. Anything you typed yourself will be replaced too, so use "fill only what is still empty" if you have already edited the abstract.'
    }) : null,
    reportHolder
  ]);
}
