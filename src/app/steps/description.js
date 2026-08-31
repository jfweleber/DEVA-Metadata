// =============================================================================
// STEP 7: PORTAL DESCRIPTION CONTENT
// =============================================================================
// The parts of the HTML snippet that are not derived from the XML: the
// overview, an optional classification table, methodology prose, the two
// callout boxes and references. Section order in the output is fixed by
// Section 3.3 of the standard and is not editable here.
// =============================================================================

import { el, toast, setChildren } from '../dom.js';
import { state } from '../store.js';
import { field, textInput, textArea, checkbox, boundInput, group, commit } from '../controls.js';
import { clean } from '../../lib/text.js';

function classificationRow(row, index, redraw) {
  return el('div', { class: 'record' }, [
    el('div', { class: 'record-head' }, [
      el('h4', { text: `Row ${index + 1}` }),
      el('button', {
        type: 'button',
        class: 'danger',
        text: 'Remove',
        on: {
          click: () => {
            state.project.htmlClassification.rows.splice(index, 1);
            commit();
            redraw();
          }
        }
      })
    ]),
    field('Label', boundInput(row, 'label', { placeholder: 'Optimal Core' })),
    field('Definition', boundInput(row, 'description', {
      multiline: true,
      rows: 2,
      placeholder: 'HSI 2.5 to 3.0. Highest quality habitat conditions.'
    }))
  ]);
}

function referenceRow(index, redraw) {
  const node = el('textarea', { rows: 2, value: state.project.htmlReferences[index] || '' });
  node.addEventListener('input', () => {
    state.project.htmlReferences[index] = node.value;
    commit();
  });
  return el('div', { class: 'record' }, [
    el('div', { class: 'record-head' }, [
      el('h4', { text: `Reference ${index + 1}` }),
      el('button', {
        type: 'button',
        class: 'danger',
        text: 'Remove',
        on: {
          click: () => {
            state.project.htmlReferences.splice(index, 1);
            commit();
            redraw();
          }
        }
      })
    ]),
    node
  ]);
}

export function render(context) {
  const project = state.project;
  if (!project.htmlClassification) project.htmlClassification = { heading: 'Classification', intro: '', rows: [] };
  if (!Array.isArray(project.htmlReferences)) project.htmlReferences = [];

  const classificationList = el('div', {});
  const drawClassification = () => {
    setChildren(classificationList, [
      ...project.htmlClassification.rows.map((row, index) => classificationRow(row, index, drawClassification)),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Add a category row',
        on: {
          click: () => {
            project.htmlClassification.rows.push({ label: '', description: '' });
            commit();
            drawClassification();
          }
        }
      })
    ]);
  };
  drawClassification();

  const referenceList = el('div', {});
  const drawReferences = () => {
    setChildren(referenceList, [
      ...project.htmlReferences.map((_, index) => referenceRow(index, drawReferences)),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Add a reference',
        on: {
          click: () => {
            project.htmlReferences.push('');
            commit();
            drawReferences();
          }
        }
      })
    ]);
  };
  drawReferences();

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Portal description' }),
    el('p', { class: 'panel-intro', text: 'Content for the HTML snippet that goes in the item Description field. The attributes table, technical specifications, contact block and footer are built automatically from what you have already entered.' }),

    group('Overview', [
      field('Overview text', textArea('htmlOverview', {
        rows: 6,
        placeholder: 'Leave blank to use the abstract. Blank lines separate paragraphs.'
      }), 'Two to three paragraphs covering description, purpose and geographic scope.'),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Copy the abstract into the overview',
        on: {
          click: () => {
            state.project.htmlOverview = state.project.abstract;
            commit();
            context.refresh();
            toast('Abstract copied');
          }
        }
      })
    ]),

    group('Classification table (optional)', [
      el('p', { class: 'hint', text: 'Use this for value tables, category definitions or model score ranges. Leave it empty to omit the section.' }),
      el('div', { class: 'grid-2' }, [
        field('Section heading', textInput('htmlClassification.heading', { placeholder: 'Habitat Categories' })),
        field('Intro sentence', textInput('htmlClassification.intro', { placeholder: 'Optional' }))
      ]),
      classificationList
    ]),

    group('Methodology (optional)', [
      field('Methodology text', textArea('htmlMethodology', {
        rows: 5,
        placeholder: 'How the layer was produced, in prose. Always include this for models and analysis layers.'
      })),
      checkbox('htmlIncludeMethodologySources', 'Include a data sources table built from the lineage sources'),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Draft methodology text from the process steps',
        on: {
          click: () => {
            const steps = (state.project.processSteps || [])
              .map((step) => clean(step.description))
              .filter(Boolean);
            if (!steps.length) {
              toast('No process steps to summarize');
              return;
            }
            state.project.htmlMethodology = steps.join('\n\n');
            commit();
            context.refresh();
            toast('Methodology drafted from the lineage. Edit it into prose for a public audience.');
          }
        }
      })
    ]),

    group('Use limitations', [
      field('Caution box (yellow)', textArea('htmlCaution', {
        rows: 3,
        placeholder: 'State prohibited uses. For example: These polygons are a planning-level model output and must not be used to determine regulatory compliance or to site infrastructure without field verification.'
      })),
      field('Note box (gray)', textArea('htmlNote', {
        rows: 3,
        placeholder: 'General caveat. Leave blank to use the standard planning-purposes note.'
      }))
    ]),

    group('Data quality and references (optional)', [
      field('Data quality text', textArea('htmlDataQuality', {
        rows: 4,
        placeholder: 'Source accuracy, vintage, known issues.'
      })),
      el('div', { class: 'field-label', text: 'References' }),
      referenceList
    ]),

    group('Footer', [
      field('Created by', textInput('htmlCreatedBy'),
        'Appears in the metadata footer of the snippet.')
    ])
  ]);
}
