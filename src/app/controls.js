// =============================================================================
// FORM CONTROLS
// =============================================================================
// Builders that bind directly to the project in the store. Each control writes
// its value on input and asks the shell to refresh validation, but never
// re-renders its own panel, so the caret stays where the user put it.
// =============================================================================

import { el, setChildren } from './dom.js';
import { state, save, notify } from './store.js';

/**
 * Read a dotted path from the project: 'contact.person'.
 */
export function getPath(source, path) {
  return String(path).split('.').reduce((value, key) => (value == null ? value : value[key]), source);
}

export function setPath(source, path, value) {
  const keys = String(path).split('.');
  const last = keys.pop();
  let target = source;
  for (const key of keys) {
    if (target[key] === undefined || target[key] === null) target[key] = {};
    target = target[key];
  }
  target[last] = value;
}

/**
 * Record an edit: persist and refresh validation, without redrawing the panel.
 */
export function commit() {
  save();
  notify('value');
}

/**
 * Label, control and hint wrapper.
 */
export function field(labelText, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return el('div', { class: 'field' }, [
    el('label', { for: id, text: labelText }),
    control,
    hint ? el('span', { class: 'hint', text: hint }) : null
  ]);
}

/**
 * Single-line input bound to a project path.
 */
export function textInput(path, options = {}) {
  const node = el('input', {
    type: options.type || 'text',
    value: getPath(state.project, path) ?? '',
    placeholder: options.placeholder || '',
    inputmode: options.inputmode
  });
  node.addEventListener('input', () => {
    setPath(state.project, path, node.value);
    commit();
  });
  return node;
}

/**
 * Multi-line input bound to a project path.
 */
export function textArea(path, options = {}) {
  const node = el('textarea', {
    value: getPath(state.project, path) ?? '',
    placeholder: options.placeholder || '',
    rows: options.rows || 4
  });
  node.addEventListener('input', () => {
    setPath(state.project, path, node.value);
    commit();
  });
  return node;
}

/**
 * Date input bound to a project path holding an FGDC compact date.
 */
export function dateInput(path, options = {}) {
  const { toInputDate, toFgdcDate } = options.helpers;
  const node = el('input', { type: 'date', value: toInputDate(getPath(state.project, path)) });
  node.addEventListener('input', () => {
    setPath(state.project, path, node.value ? toFgdcDate(node.value) : '');
    commit();
  });
  return node;
}

/**
 * Select bound to a project path. `options.items` is [{value,label}] or strings.
 */
export function select(path, options = {}) {
  const current = String(getPath(state.project, path) ?? '');
  const items = (options.items || []).map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
  const node = el('select', {}, items.map((item) => el('option', {
    value: item.value,
    text: item.label,
    selected: String(item.value) === current
  })));
  if (!items.some((item) => String(item.value) === current)) node.value = items.length ? items[0].value : '';
  node.addEventListener('change', () => {
    setPath(state.project, path, node.value);
    commit();
    if (options.onChange) options.onChange(node.value);
  });
  return node;
}

/**
 * Checkbox bound to a project path.
 */
export function checkbox(path, labelText, options = {}) {
  const input = el('input', { type: 'checkbox', checked: Boolean(getPath(state.project, path)) });
  input.addEventListener('change', () => {
    setPath(state.project, path, input.checked);
    commit();
    if (options.onChange) options.onChange(input.checked);
  });
  return el('label', { class: 'checkbox' }, [input, el('span', {}, [
    el('span', { text: labelText }),
    options.hint ? el('span', { class: 'hint', text: options.hint }) : null
  ])]);
}

/**
 * Chip editor for a list of short strings such as keywords.
 */
export function tagEditor(path, options = {}) {
  const wrapper = el('div', {});
  const entry = el('input', { type: 'text', placeholder: options.placeholder || 'Type a value, then press Enter' });
  const list = el('ul', { class: 'tag-list' });

  const values = () => {
    const current = getPath(state.project, path);
    return Array.isArray(current) ? current : [];
  };

  const draw = () => {
    setChildren(list, [...values().map((value, index) => el('li', { class: 'tag' }, [
      el('span', { text: value }),
      el('button', {
        type: 'button',
        title: `Remove ${value}`,
        'aria-label': `Remove ${value}`,
        text: '×',
        on: {
          click: () => {
            const next = values().slice();
            next.splice(index, 1);
            setPath(state.project, path, next);
            commit();
            draw();
          }
        }
      })
    ]))]);
  };

  const add = () => {
    const raw = entry.value.trim();
    if (!raw) return;
    // Accept comma separated input in one go.
    const additions = raw.split(',').map((item) => item.trim()).filter(Boolean);
    const next = values().slice();
    for (const addition of additions) {
      if (!next.some((existing) => existing.toLowerCase() === addition.toLowerCase())) next.push(addition);
    }
    setPath(state.project, path, next);
    entry.value = '';
    commit();
    draw();
  };

  entry.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  });
  entry.addEventListener('blur', add);

  const suggestions = (options.suggestions || []).length
    ? el('div', { class: 'tag-list' }, options.suggestions.map((suggestion) => el('button', {
      type: 'button',
      class: 'ghost',
      text: `+ ${suggestion}`,
      on: {
        click: () => {
          const next = values().slice();
          if (!next.some((existing) => existing.toLowerCase() === suggestion.toLowerCase())) {
            next.push(suggestion);
            setPath(state.project, path, next);
            commit();
            draw();
          }
        }
      }
    })))
    : null;

  draw();
  wrapper.append(entry, list);
  if (suggestions) wrapper.append(suggestions);
  return wrapper;
}

/**
 * Input bound to an arbitrary object rather than the project root, used for
 * items inside repeatable lists.
 */
export function boundInput(target, key, options = {}) {
  const node = options.multiline
    ? el('textarea', { rows: options.rows || 3, placeholder: options.placeholder || '' })
    : el('input', { type: options.type || 'text', placeholder: options.placeholder || '' });
  node.value = target[key] ?? '';
  node.addEventListener('input', () => {
    target[key] = node.value;
    commit();
    if (options.onInput) options.onInput(node.value);
  });
  return node;
}

/**
 * Section wrapper.
 */
export function group(legendText, children) {
  return el('fieldset', {}, [el('legend', { text: legendText }), ...children.filter(Boolean)]);
}
