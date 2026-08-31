// =============================================================================
// APPLICATION SHELL
// =============================================================================
// Owns the step navigation, the validation badges and the panel lifecycle.
// A panel is rendered once when its step opens; typing inside it updates the
// project and refreshes the navigation badges, but does not redraw the panel.
// =============================================================================

import { el, clear, qs, toast } from './dom.js';
import { state, subscribe, setStep, restore, clearDraft } from './store.js';
import { validateProject } from '../lib/validate.js';
import * as uploadStep from './steps/upload.js';
import * as describeStep from './steps/describe.js';
import * as identificationStep from './steps/identification.js';
import * as keywordsStep from './steps/keywords.js';
import * as spatialStep from './steps/spatial.js';
import * as lineageStep from './steps/lineage.js';
import * as attributesStep from './steps/attributes.js';
import * as descriptionStep from './steps/description.js';
import * as reviewStep from './steps/review.js';

const STEPS = [
  { id: 'upload', label: 'Upload', module: uploadStep },
  { id: 'describe', label: 'Describe', module: describeStep },
  { id: 'identification', label: 'Identification', module: identificationStep },
  { id: 'keywords', label: 'Keywords', module: keywordsStep },
  { id: 'spatial', label: 'Spatial', module: spatialStep },
  { id: 'lineage', label: 'Lineage', module: lineageStep },
  { id: 'attributes', label: 'Attributes', module: attributesStep },
  { id: 'description', label: 'Description', module: descriptionStep },
  { id: 'review', label: 'Review and download', module: reviewStep }
];

// Validation issues are reported against a step key. Two of them fold into
// panels that cover more than their own section.
const ISSUE_STEP_MAP = { contact: 'identification' };

const context = {
  // Used by panels that mutate state and need their own controls redrawn.
  refresh: () => renderAll(),
  goTo: (step) => setStep(step)
};

function errorsByStep() {
  const counts = {};
  const result = validateProject(state.project);
  for (const issue of result.errors) {
    const key = ISSUE_STEP_MAP[issue.step] || issue.step;
    counts[key] = (counts[key] || 0) + 1;
  }
  return { counts, result };
}

function renderNav(counts) {
  const nav = qs('#stepnav');
  const list = el('ol', {});
  STEPS.forEach((step, index) => {
    // Badges only mean something once there is a record to validate.
    const errorCount = state.hasImport ? (counts[step.id] || 0) : 0;
    const isCurrent = state.step === step.id;
    const settled = state.hasImport && step.id !== 'upload' && step.id !== 'review' && !errorCount;
    list.append(el('li', {}, [
      el('button', {
        type: 'button',
        'aria-current': isCurrent ? 'step' : null,
        disabled: !state.hasImport && step.id !== 'upload',
        'aria-label': errorCount
          ? `${step.label}, ${errorCount} item${errorCount === 1 ? '' : 's'} need attention`
          : step.label,
        title: errorCount ? `${errorCount} item${errorCount === 1 ? '' : 's'} need attention` : step.label,
        on: { click: () => setStep(step.id) }
      }, [
        // The marker always carries the step number so it cannot be misread as
        // a count; outstanding items get their own red badge after the label.
        el('span', { class: settled ? 'marker is-done' : 'marker', text: String(index + 1) }),
        el('span', { text: step.label, style: 'flex:1;' }),
        errorCount ? el('span', { class: 'pill todo', text: String(errorCount) }) : null
      ])
    ]));
  });
  clear(nav).append(list);
}

function renderPanel() {
  const main = qs('#panel');
  const step = STEPS.find((item) => item.id === state.step) || STEPS[0];
  const node = step.module.render(context);

  // Previous and next navigation, except on the upload screen where the step
  // module supplies its own actions.
  if (step.id !== 'upload') {
    const index = STEPS.indexOf(step);
    const previous = STEPS[index - 1];
    const next = STEPS[index + 1];
    node.append(el('div', { class: 'actions' }, [
      previous ? el('button', {
        type: 'button',
        class: 'secondary',
        text: `Back: ${previous.label}`,
        on: {
          click: () => {
            setStep(previous.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }) : el('span'),
      next ? el('button', {
        type: 'button',
        text: `Next: ${next.label}`,
        on: {
          click: () => {
            setStep(next.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }) : el('span')
    ]));
  }

  clear(main).append(node);
}

function renderStatus(result) {
  const status = qs('#status-line');
  if (!status) return;
  if (!state.hasImport) {
    status.textContent = '';
    return;
  }
  const errors = result.errors.length;
  const warnings = result.warnings.length;
  status.textContent = errors
    ? `${errors} required item${errors === 1 ? '' : 's'} outstanding`
    : (warnings ? `Ready to download, ${warnings} suggestion${warnings === 1 ? '' : 's'}` : 'Ready to download');
}

function renderAll() {
  const { counts, result } = errorsByStep();
  renderNav(counts);
  renderPanel();
  renderStatus(result);
}

/**
 * Refresh only the parts that depend on validation, so typing in a panel does
 * not rebuild the panel underneath the caret.
 */
function refreshBadges() {
  const { counts, result } = errorsByStep();
  renderNav(counts);
  renderStatus(result);
}

export function start() {
  const restored = restore();
  if (restored && state.hasImport) {
    state.step = 'review';
  }

  qs('#restart').addEventListener('click', () => {
    if (!window.confirm('Clear this record and start over? Anything not downloaded will be lost.')) return;
    clearDraft();
    renderAll();
    toast('Cleared');
  });

  // A keystroke only refreshes the badges, so the panel is never rebuilt under
  // the caret. Everything else (step change, import, reset) redraws the shell.
  subscribe((reason) => {
    if (reason === 'value') refreshBadges();
    else renderAll();
  });

  renderAll();
  if (restored && state.hasImport) {
    toast('Restored your last record from this browser');
  }
}
