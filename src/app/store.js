// =============================================================================
// APPLICATION STATE
// =============================================================================
// One project at a time, autosaved to localStorage so a half-finished record
// survives a closed tab. Nothing is ever sent anywhere: the whole tool runs in
// the browser, which is what lets staff drop an unpublished dataset export into
// it without a data-handling conversation.
// =============================================================================

import { createProject } from '../lib/model.js';

const STORAGE_KEY = 'deva-metadata-publisher:project';
const listeners = new Set();

export const state = {
  project: createProject(),
  step: 'upload',
  hasImport: false
};

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(reason = 'change') {
  for (const listener of listeners) listener(reason);
}

/**
 * Replace the whole project, e.g. after an import or a draft load.
 */
export function setProject(project, { hasImport = true } = {}) {
  state.project = project;
  state.hasImport = hasImport;
  save();
  notify('project');
}

/**
 * Update a top-level project value and persist.
 */
export function setValue(key, value) {
  state.project[key] = value;
  save();
  notify('value');
}

export function setStep(step) {
  state.step = step;
  notify('step');
}

let saveTimer = null;
export function save() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      state.project.savedAt = new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        project: state.project,
        hasImport: state.hasImport
      }));
    } catch {
      // Private browsing or a full quota. Losing the autosave is not fatal.
    }
  }, 400);
}

/**
 * Restore the autosaved draft, if there is one.
 */
export function restore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.project) return false;
    // Merge onto a fresh project so drafts saved by an older version still open.
    state.project = { ...createProject(), ...parsed.project };
    state.hasImport = Boolean(parsed.hasImport);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
  state.project = createProject();
  state.hasImport = false;
  state.step = 'upload';
  notify('project');
}
