// =============================================================================
// STEP 6: ENTITY AND ATTRIBUTES
// =============================================================================
// The eainfo block, one attr per field. This is where a Pro export needs the
// most human help: ArcGIS carries field names, types and widths, but the
// definitions, definition sources and domains that FGDC requires are usually
// blank.
//
// Visibility rules from Section 5: system and editor tracking fields are
// documented in the XML and kept out of the Portal HTML table.
// =============================================================================

import { el, toast, setChildren } from '../dom.js';
import { state } from '../store.js';
import { field, textInput, textArea, boundInput, group, commit } from '../controls.js';
import { createField, FGDC_TYPES, SYSTEM_FIELDS, typeTakesDecimals } from '../../lib/model.js';
import { clean, cleanLine } from '../../lib/text.js';

const ROLE_LABEL = { user: 'user field', system: 'system', editor: 'editor tracking' };

function boundSelect(target, key, items, onChange) {
  const node = el('select', {}, items.map((item) => {
    const value = typeof item === 'string' ? item : item.value;
    const label = typeof item === 'string' ? item : item.label;
    return el('option', { value, text: label, selected: String(target[key]) === String(value) });
  }));
  node.addEventListener('change', () => {
    target[key] = node.value;
    commit();
    if (onChange) onChange(node.value);
  });
  return node;
}

function boundCheckbox(target, key, labelText, onChange) {
  const input = el('input', { type: 'checkbox', checked: Boolean(target[key]) });
  input.addEventListener('change', () => {
    target[key] = input.checked;
    commit();
    if (onChange) onChange(input.checked);
  });
  return el('label', { class: 'checkbox' }, [input, el('span', { text: labelText })]);
}

/**
 * Editor for one enumerated value inside a coded-value domain.
 */
function valueRow(fieldRecord, entry, index, redraw) {
  return el('div', { class: 'record' }, [
    el('div', { class: 'record-head' }, [
      el('h4', { text: `Value ${index + 1}` }),
      el('button', {
        type: 'button',
        class: 'danger',
        text: 'Remove',
        on: {
          click: () => {
            fieldRecord.values.splice(index, 1);
            commit();
            redraw();
          }
        }
      })
    ]),
    el('div', { class: 'grid-2' }, [
      field('Value', boundInput(entry, 'value', { placeholder: 'Optimal Core' })),
      field('Value definition source', boundInput(entry, 'source', { placeholder: 'Death Valley National Park' }))
    ]),
    field('What the value means', boundInput(entry, 'definition', {
      multiline: true,
      rows: 2,
      placeholder: 'Areas where at least 40% of the surrounding 450m neighborhood consists of optimal-quality habitat.'
    }))
  ]);
}

/**
 * Domain editor, switching between the three FGDC domain types.
 */
function domainEditor(fieldRecord) {
  const holder = el('div', {});
  const draw = () => {
    if (fieldRecord.domainType === 'edom') {
      const list = el('div', {});
      const redraw = () => {
        setChildren(list, [
          ...fieldRecord.values.map((entry, index) => valueRow(fieldRecord, entry, index, redraw)),
          fieldRecord.values.length ? null : el('p', { class: 'hint', text: 'No values listed yet.' }),
          el('button', {
            type: 'button',
            class: 'secondary',
            text: 'Add a value',
            on: {
              click: () => {
                fieldRecord.values.push({
                  value: '',
                  definition: '',
                  source: fieldRecord.definitionSource || 'Death Valley National Park'
                });
                commit();
                redraw();
              }
            }
          })
        ]);
      };
      redraw();
      setChildren(holder, [
        el('p', { class: 'hint', text: 'Each value is written as its own attrdomv block, never nested.' }),
        list
      ]);
    } else if (fieldRecord.domainType === 'rdom') {
      setChildren(holder, [el('div', { class: 'grid-3' }, [
        field('Minimum', boundInput(fieldRecord, 'rangeMin', { placeholder: '0.01' })),
        field('Maximum', boundInput(fieldRecord, 'rangeMax', { placeholder: '18422.53' })),
        field('Units', boundInput(fieldRecord, 'units', { placeholder: 'acres' }))
      ])]);
    } else {
      setChildren(holder, [field('Characterization of the values',
        boundInput(fieldRecord, 'udom', {
          multiline: true,
          rows: 2,
          placeholder: 'Free text describing the values, for example: Common and scientific names of species observed at the site.'
        }))]);
    }
  };
  draw();
  return { node: holder, draw };
}

/**
 * What the exported data actually contains for this field. Shown rather than
 * applied: measured values are offered to the user, who decides whether they
 * describe a real domain. Turning four observed names into a declared
 * controlled vocabulary would be inventing a schema the geodatabase never had.
 */
function observedPanel(fieldRecord, redrawDomain) {
  const observed = fieldRecord.observed;
  if (!observed || !observed.count) return null;

  const parts = [];
  parts.push(`${observed.count.toLocaleString('en-US')} value${observed.count === 1 ? '' : 's'} in the exported data`);
  if (observed.nulls) parts.push(`${observed.nulls.toLocaleString('en-US')} empty`);
  if (observed.min !== null && observed.max !== null) parts.push(`range ${observed.min} to ${observed.max}`);
  if (observed.dateMin) parts.push(`dates ${observed.dateMin.slice(0, 10)} to ${observed.dateMax.slice(0, 10)}`);
  if (observed.truncated) parts.push('more than 25 distinct values');

  const children = [el('p', { class: 'hint', style: 'margin:0 0 6px;', text: parts.join(' | ') })];

  if (observed.distinct && observed.distinct.length) {
    children.push(el('p', { class: 'hint', style: 'margin:0 0 8px;' }, [
      el('strong', { text: 'Observed values: ' }),
      el('span', { text: observed.distinct.join(', ') })
    ]));
    if (fieldRecord.domainType !== 'edom') {
      children.push(el('button', {
        type: 'button',
        class: 'ghost',
        text: `Use these ${observed.distinct.length} values as an enumerated domain`,
        on: {
          click: () => {
            fieldRecord.domainType = 'edom';
            fieldRecord.values = observed.distinct.map((value) => ({
              value,
              definition: '',
              source: fieldRecord.definitionSource || 'Death Valley National Park'
            }));
            commit();
            redrawDomain();
            toast('Values added. Each one still needs a definition.');
          }
        }
      }));
    }
  }

  if (observed.min !== null && observed.max !== null && fieldRecord.domainType !== 'rdom') {
    children.push(el('button', {
      type: 'button',
      class: 'ghost',
      text: 'Use the observed range as a range domain',
      on: {
        click: () => {
          fieldRecord.domainType = 'rdom';
          fieldRecord.rangeMin = String(observed.min);
          fieldRecord.rangeMax = String(observed.max);
          commit();
          redrawDomain();
        }
      }
    }));
  }

  return el('div', { class: 'callout', style: 'margin:10px 0;' }, children);
}

function fieldCard(fieldRecord, index, redrawAll) {
  const needsDefinition = !clean(fieldRecord.definition);
  const pills = [
    el('span', { class: `pill ${fieldRecord.role}`, text: ROLE_LABEL[fieldRecord.role] || fieldRecord.role }),
    el('span', { class: 'pill', text: fieldRecord.type }),
    fieldRecord.domainType !== 'udom' ? el('span', { class: 'pill', text: fieldRecord.domainType }) : null,
    needsDefinition ? el('span', { class: 'pill todo', text: 'needs definition' }) : null,
    // A suggested definition is not a written one until somebody has read it.
    fieldRecord.definitionDraft && !needsDefinition
      ? el('span', { class: 'pill editor', text: 'suggested, review it' })
      : null
  ];

  const domain = domainEditor(fieldRecord);

  // The domain editor and the observed-values panel both change when the domain
  // type changes, so they are redrawn together.
  const domainHolder = el('div', {});
  const redrawDomainSection = () => {
    domain.draw();
    setChildren(domainHolder, [domain.node, observedPanel(fieldRecord, redrawDomainSection)]);
  };
  redrawDomainSection();

  const decimalsHolder = el('div', {});
  const drawDecimals = () => {
    setChildren(decimalsHolder, [typeTakesDecimals(fieldRecord.type)
      ? field('Decimal places', boundInput(fieldRecord, 'decimals', { inputmode: 'numeric' }),
        'atnumdec. Use 0 for integers.')
      : el('p', { class: 'hint', text: 'Decimal places do not apply to this type and will be left out.' })]);
  };
  drawDecimals();

  const card = el('details', { class: 'field-card', open: needsDefinition && fieldRecord.role === 'user' });
  card.append(...[
    el('summary', {}, [
      el('span', { class: 'field-name', text: fieldRecord.name || '(unnamed)' }),
      ...pills.filter(Boolean)
    ]),
    el('div', { class: 'body' }, [
      el('div', { class: 'grid-4' }, [
        field('Field name', boundInput(fieldRecord, 'name'), 'Exact geodatabase name.'),
        field('Alias', boundInput(fieldRecord, 'alias')),
        field('Type', boundSelect(fieldRecord, 'type', FGDC_TYPES, drawDecimals)),
        field('Width', boundInput(fieldRecord, 'width', { inputmode: 'numeric' }))
      ]),
      decimalsHolder,
      field('Definition', boundInput(fieldRecord, 'definition', {
        multiline: true,
        rows: 2,
        placeholder: 'What the values represent. Not a restatement of the field name.',
        // Touching the text means a person has taken responsibility for it, so
        // it stops being flagged as a suggestion.
        onInput: () => {
          if (fieldRecord.definitionDraft) {
            fieldRecord.definitionDraft = false;
            const pill = [...card.querySelectorAll('summary .pill')]
              .find((node) => node.textContent.startsWith('suggested'));
            if (pill) pill.remove();
          }
        }
      })),
      fieldRecord.definitionDraft ? el('p', {
        class: 'hint',
        style: 'margin-top:-8px;',
        text: 'This wording was suggested from the field name. Check that it is true of your data, and edit it so it says something the name does not.'
      }) : null,
      field('Definition source', boundInput(fieldRecord, 'definitionSource', {
        placeholder: 'Death Valley National Park, ESRI, or the source agency'
      })),
      field('Domain type', boundSelect(fieldRecord, 'domainType', [
        { value: 'udom', label: 'Free text (udom)' },
        { value: 'edom', label: 'Enumerated values (edom)' },
        { value: 'rdom', label: 'Numeric range (rdom)' }
      ], redrawDomainSection)),
      domainHolder,
      el('div', { class: 'grid-2', style: 'margin-top:12px;' }, [
        boundCheckbox(fieldRecord, 'includeInXml', 'Document in the FGDC XML'),
        boundCheckbox(fieldRecord, 'includeInHtml', 'Show in the Portal attributes table')
      ]),
      el('div', { style: 'margin-top:8px;' }, [
        el('button', {
          type: 'button',
          class: 'danger',
          text: 'Delete this field',
          on: {
            click: () => {
              state.project.fields.splice(index, 1);
              commit();
              redrawAll();
            }
          }
        })
      ])
    ])
  ]);
  return card;
}

export function render(context) {
  const project = state.project;
  const listHolder = el('div', {});
  const showSystem = { value: false };

  const draw = () => {
    const cards = project.fields
      .map((fieldRecord, index) => ({ fieldRecord, index }))
      .filter(({ fieldRecord }) => showSystem.value || fieldRecord.role === 'user')
      .map(({ fieldRecord, index }) => fieldCard(fieldRecord, index, draw));

    const hiddenCount = project.fields.filter((f) => f.role !== 'user').length;

    setChildren(listHolder, [
      project.fields.length
        ? el('div', {}, cards)
        : el('div', { class: 'callout warn' }, [
          el('p', { html: '<strong>No fields are documented.</strong> Upload an export that includes the schema, or add each field by hand from the real geodatabase schema. Never guess an attribute table.' })
        ]),
      hiddenCount ? el('label', { class: 'checkbox' }, [
        (() => {
          const input = el('input', { type: 'checkbox', checked: showSystem.value });
          input.addEventListener('change', () => {
            showSystem.value = input.checked;
            draw();
          });
          return input;
        })(),
        el('span', { text: `Show the ${hiddenCount} system and editor tracking field${hiddenCount === 1 ? '' : 's'}` })
      ]) : null,
      el('div', { class: 'actions' }, [
        el('button', {
          type: 'button',
          class: 'secondary',
          text: 'Add a field',
          on: {
            click: () => {
              project.fields.push(createField({ name: '', type: 'String' }));
              commit();
              showSystem.value = true;
              draw();
            }
          }
        }),
        el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Apply standard wording to system fields',
          on: {
            click: () => {
              let changed = 0;
              for (const fieldRecord of project.fields) {
                const preset = SYSTEM_FIELDS[String(fieldRecord.name).toLowerCase()];
                if (!preset) continue;
                fieldRecord.definition = preset.definition;
                fieldRecord.definitionSource = 'ESRI';
                fieldRecord.domainType = 'udom';
                fieldRecord.udom = preset.domain;
                fieldRecord.includeInHtml = false;
                changed += 1;
              }
              commit();
              draw();
              toast(changed ? `Updated ${changed} system fields` : 'No system fields found');
            }
          }
        })
      ])
    ]);
  };
  draw();

  const editorFields = project.fields.filter((f) => f.role === 'editor');

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Entity and attributes' }),
    el('p', { class: 'panel-intro', text: 'Every field gets documented in the XML. Only user-facing fields appear in the Portal description table.' }),

    group('Entity', [
      field('Entity name', textInput('entityName'), 'The feature class or table name.'),
      field('Entity description', textArea('entityDescription', { rows: 3 }),
        'What one record in this dataset represents.'),
      field('Entity definition source', textInput('entityDescriptionSource'))
    ]),

    editorFields.length ? el('div', { class: 'callout warn' }, [
      el('p', {
        html: `<strong>Editor tracking is enabled.</strong> The `
          + `${editorFields.map((f) => cleanLine(f.name)).join(', ')} `
          + `field${editorFields.length === 1 ? ' is' : 's are'} excluded from both artifacts by default under `
          + 'Section 5.2, and a note saying so is added to the Portal technical specifications.'
      })
    ]) : null,

    group('Fields', [listHolder])
  ]);
}
