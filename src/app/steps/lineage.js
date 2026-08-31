// =============================================================================
// STEP 5: LINEAGE AND DATA QUALITY
// =============================================================================
// dataqual. Section 2.2 of the standard is blunt about this: lineage is the
// section reviewers actually read. Sources need originator, date, scale and
// access; process steps need dates, tool names and parameters.
// =============================================================================

import { el, setChildren } from '../dom.js';
import { state } from '../store.js';
import { field, textArea, boundInput, checkbox, group, commit } from '../controls.js';
import { createSource, createProcessStep } from '../../lib/model.js';
import { toInputDate, toFgdcDate } from '../../lib/text.js';
import { crsNoteFor } from '../../lib/fgdc.js';

/**
 * Date control bound to an object inside a repeatable list.
 */
function boundDate(target, key) {
  const node = el('input', { type: 'date', value: toInputDate(target[key]) });
  node.addEventListener('input', () => {
    target[key] = node.value ? toFgdcDate(node.value) : '';
    commit();
  });
  return node;
}

function sourceCard(source, index, redraw) {
  return el('div', { class: 'record' }, [
    el('div', { class: 'record-head' }, [
      el('h4', { text: `Source ${index + 1}` }),
      el('button', {
        type: 'button',
        class: 'danger',
        text: 'Remove',
        on: {
          click: () => {
            state.project.sources.splice(index, 1);
            commit();
            redraw();
          }
        }
      })
    ]),
    el('div', { class: 'grid-2' }, [
      field('Title', boundInput(source, 'title', { placeholder: 'National Wilderness Preservation System' })),
      field('Originator', boundInput(source, 'originator', { placeholder: 'Wilderness.net / Aldo Leopold Wilderness Research Institute' }))
    ]),
    el('div', { class: 'grid-3' }, [
      field('Publication date', boundDate(source, 'pubdate')),
      field('Scale or resolution', boundInput(source, 'scale', { placeholder: '24000' })),
      field('Source type', (() => {
        const node = el('select', {}, ['online', 'paper', 'digital file', 'CD-ROM', 'field survey']
          .map((item) => el('option', { value: item, text: item, selected: source.typesrc === item })));
        node.addEventListener('change', () => {
          source.typesrc = node.value;
          commit();
        });
        return node;
      })())
    ]),
    el('div', { class: 'grid-2' }, [
      field('Citation abbreviation', boundInput(source, 'citationAbbrev', { placeholder: 'Wilderness.net NWPS' })),
      field('Access URL', boundInput(source, 'url', { type: 'url', placeholder: 'https://...' }))
    ]),
    field('Contribution', boundInput(source, 'contribution', {
      multiline: true,
      rows: 2,
      placeholder: 'Source polygon geometry and all attributes'
    }), 'What this source contributed to the finished dataset.')
  ]);
}

function stepCard(step, index, redraw) {
  return el('div', { class: 'record' }, [
    el('div', { class: 'record-head' }, [
      el('h4', { text: `Process step ${index + 1}` }),
      el('div', {}, [
        index > 0 ? el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Move up',
          on: {
            click: () => {
              const list = state.project.processSteps;
              [list[index - 1], list[index]] = [list[index], list[index - 1]];
              commit();
              redraw();
            }
          }
        }) : null,
        el('button', {
          type: 'button',
          class: 'danger',
          text: 'Remove',
          on: {
            click: () => {
              state.project.processSteps.splice(index, 1);
              commit();
              redraw();
            }
          }
        })
      ])
    ]),
    field('What was done', boundInput(step, 'description', {
      multiline: true,
      rows: 3,
      placeholder: 'Ran Focal Statistics with a 450 meter circular neighborhood on the reclassified HSI raster, then converted the result to polygons with Raster to Polygon.'
    }), 'Name the tool and the parameter values. "Buffered the layer" is not a process step, "Buffered by 450 m to match the HSI focal neighborhood" is.'),
    field('Date', boundDate(step, 'date'))
  ]);
}

export function render(context) {
  const project = state.project;

  const sourceList = el('div', {});
  const drawSources = () => {
    setChildren(sourceList, [
      ...project.sources.map((source, index) => sourceCard(source, index, drawSources)),
      project.sources.length ? null : el('p', { class: 'hint', text: 'No sources documented yet. Every input dataset should be cited.' }),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Add a source',
        on: {
          click: () => {
            project.sources.push(createSource());
            commit();
            drawSources();
          }
        }
      })
    ]);
  };
  drawSources();

  const stepList = el('div', {});
  const drawSteps = () => {
    setChildren(stepList, [
      ...project.processSteps.map((step, index) => stepCard(step, index, drawSteps)),
      project.processSteps.length ? null : el('p', { class: 'hint', text: 'No process steps yet. At least one is required.' }),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Add a process step',
        on: {
          click: () => {
            project.processSteps.push(createProcessStep({ date: project.pubdate }));
            commit();
            drawSteps();
          }
        }
      })
    ]);
  };
  drawSteps();

  const note = crsNoteFor(project);

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Lineage and data quality' }),
    el('p', { class: 'panel-intro', text: 'The section reviewers actually read. Document every source and every processing step in order, with dates, tool names and key parameters.' }),

    group('Source datasets', [sourceList]),

    group('Process steps', [
      stepList,
      note ? el('div', { class: 'callout' }, [
        el('p', { html: '<strong>Coordinate system note.</strong> Your analysis and service coordinate systems differ, so Section 2.3 requires the last process step to say so. This sentence will be appended to it:' }),
        el('p', { html: `<em>${note.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</em>` }),
        checkbox('appendCrsNote', 'Append the coordinate system note to the final process step')
      ]) : null
    ]),

    group('Quality reports', [
      field('Logical consistency', textArea('logicalConsistency', { rows: 3 }),
        'Required by FGDC. How geometry and attribute integrity were checked.'),
      field('Completeness', textArea('completeness', { rows: 3 }),
        'Required by FGDC. What is covered, and anything knowingly omitted.'),
      field('Attribute accuracy', textArea('attributeAccuracy', { rows: 2, placeholder: 'Optional' })),
      field('Positional accuracy', textArea('positionalAccuracy', { rows: 2, placeholder: 'Optional. Horizontal accuracy of the source geometry.' }))
    ])
  ]);
}
