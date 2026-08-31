// =============================================================================
// STEP 3: KEYWORDS AND CONSTRAINTS
// =============================================================================
// idinfo/keywords, idinfo/accconst and idinfo/useconst. The use constraints are
// not editable: Section 2.6 requires the NPS disclaimer verbatim, and a
// paraphrase is one of the errors that gets caught in review.
// =============================================================================

import { el, toast } from '../dom.js';
import { state } from '../store.js';
import { field, textInput, textArea, select, tagEditor, group, commit } from '../controls.js';
import { NPS_USE_CONSTRAINTS, ISO_TOPIC_CATEGORIES, DEFAULT_ACCESS_CONSTRAINTS } from '../../lib/model.js';
import { clean } from '../../lib/text.js';

const PLACE_SUGGESTIONS = [
  'Death Valley National Park', 'Death Valley', 'Inyo County',
  'San Bernardino County', 'California', 'Nevada', 'Mojave Desert'
];

const THEME_SUGGESTIONS = ['National Park Service', 'Death Valley', 'NPS', 'DEVA'];

export function render(context) {
  const project = state.project;

  const disclaimerBox = el('textarea', {
    rows: 8,
    readonly: 'readonly',
    'aria-label': 'NPS use constraints disclaimer',
    value: project.useConstraints
  });

  const disclaimerStatus = el('p', { class: 'hint' });
  const refreshStatus = () => {
    const verbatim = clean(project.useConstraints) === NPS_USE_CONSTRAINTS;
    disclaimerStatus.textContent = verbatim
      ? 'Matches the required text exactly.'
      : 'This does not match the required text. Use the restore button.';
    disclaimerStatus.style.color = verbatim ? '' : 'var(--error-line)';
  };
  refreshStatus();

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Keywords and constraints' }),
    el('p', { class: 'panel-intro', text: 'Keywords drive search in Portal and AGOL. Match them to the tags you will set on the item.' }),

    group('Theme keywords', [
      field('Keywords', tagEditor('themeKeywords', {
        placeholder: 'Add a keyword, then press Enter',
        suggestions: THEME_SUGGESTIONS
      }), 'Topic keywords describing what the data are about. Always include National Park Service and Death Valley.'),
      el('div', { class: 'grid-2' }, [
        field('Thesaurus', textInput('themeKeywordThesaurus', { placeholder: 'None' }),
          'Name the controlled vocabulary if the keywords came from one, otherwise leave it as None.'),
        field('ISO 19115 topic category', select('isoTopicCategory', {
          items: [{ value: '', label: 'Select a category' },
            ...ISO_TOPIC_CATEGORIES.map((item) => ({ value: item.name, label: `${item.name} (${item.code})` }))]
        }), 'The single best fitting category.')
      ])
    ]),

    group('Place keywords', [
      field('Places', tagEditor('placeKeywords', {
        placeholder: 'Add a place, then press Enter',
        suggestions: PLACE_SUGGESTIONS
      }))
    ]),

    group('Constraints', [
      field('Access constraints', textArea('accessConstraints', { rows: 2 }),
        'Who may obtain the data. Use "None" when the data are public.'),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Use the standard public access statement',
        on: {
          click: () => {
            state.project.accessConstraints = DEFAULT_ACCESS_CONSTRAINTS;
            commit();
            context.refresh();
          }
        }
      }),
      el('div', { class: 'field', style: 'margin-top:16px;' }, [
        el('span', { class: 'field-label', text: 'Use constraints (NPS disclaimer, required verbatim)' }),
        disclaimerBox,
        disclaimerStatus,
        el('span', { class: 'hint', text: 'Section 2.6 of the DEVA standard. This text is fixed. It is written into useconst and into the distribution liability statement.' })
      ]),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Restore the verbatim disclaimer',
        on: {
          click: () => {
            state.project.useConstraints = NPS_USE_CONSTRAINTS;
            disclaimerBox.value = NPS_USE_CONSTRAINTS;
            commit();
            refreshStatus();
            toast('Disclaimer restored');
          }
        }
      })
    ])
  ]);
}
