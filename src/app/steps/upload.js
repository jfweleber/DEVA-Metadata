// =============================================================================
// STEP 1: UPLOAD
// =============================================================================
// Two kinds of file are accepted, because two kinds get exported:
//
//   XML Workspace Document  Catalog pane, right-click a geodatabase or feature
//                           class, Export, XML Workspace Document. Describes the
//                           real schema whether or not anyone wrote metadata,
//                           and when exported with data it also gives a true
//                           feature count and observed value ranges.
//
//   Metadata export         The layer's own metadata record, in ArcGIS, FGDC or
//                           ISO form. Carries what a person wrote, and often
//                           very little else.
//
// A workspace can be hundreds of megabytes, so it is streamed through in chunks
// rather than read into a string. Everything happens in this browser either way.
// =============================================================================

import { el, toast, setChildren } from '../dom.js';
import { state, setProject, setStep, setWorkspace, clearDraft } from '../store.js';
import { importMetadataXml, detectDocumentKind } from '../../lib/import.js';
import { readWorkspaceDocument, fileChunks } from '../../lib/workspace-reader.js';
import { datasetToProject, describeDataset } from '../../lib/workspace.js';
import { createProject } from '../../lib/model.js';
import { cleanLine, formatCount } from '../../lib/text.js';

const SAMPLES = {
  workspace: { url: 'samples/workspace-export-tortoise.xml', label: 'example workspace export' },
  metadata: { url: 'samples/pro-export-desert-tortoise.xml', label: 'example metadata export' }
};

function summaryCard(value, label) {
  return el('div', { class: 'summary-card' }, [
    el('span', { class: 'value', text: String(value) }),
    el('span', { class: 'label', text: label })
  ]);
}

// -----------------------------------------------------------------------------
// After an import: what was read, and what is still needed
// -----------------------------------------------------------------------------

function importReport(project, context) {
  const summary = project.importSummary;
  if (!summary) return null;

  const roles = summary.fieldRoles || { user: 0, system: 0, editor: 0 };
  const needsDefinition = summary.fieldsMissingDefinition || [];

  return el('div', {}, [
    el('div', { class: 'callout ok' }, [
      el('p', {
        html: `<strong>Read ${cleanLine(summary.format)}.</strong>`
          + (summary.datasetName ? ` Dataset: <strong>${cleanLine(summary.datasetName)}</strong>.` : '')
          + ' The values below came from your file. Anything not found is asked for in the steps that follow.'
      })
    ]),
    el('div', { class: 'summary-grid' }, [
      summaryCard(summary.fieldCount, 'fields found'),
      summaryCard(roles.user, 'user fields'),
      summaryCard(roles.system + roles.editor, 'system / tracking fields'),
      summaryCard(needsDefinition.length, 'fields needing a definition')
    ]),
    summary.found.length ? el('div', {}, [
      el('h3', { text: 'Read from the file' }),
      el('ul', {}, summary.found.map((item) => el('li', { text: item })))
    ]) : null,
    summary.missing.length ? el('div', {}, [
      el('h3', { text: 'Not in the file, you will be asked' }),
      el('ul', {}, summary.missing.map((item) => el('li', { text: item })))
    ]) : null,
    el('div', { class: 'callout' }, [
      el('p', {
        html: '<strong>Next: describe the layer.</strong> Answer a page of mostly pick-list questions and the tool writes the abstract, purpose, summary, keywords, tags, use limitations and a first pass at the lineage. You review and edit all of it afterwards.'
      })
    ]),
    needsDefinition.length ? el('div', { class: 'callout warn' }, [
      el('p', {
        html: `<strong>${needsDefinition.length} field${needsDefinition.length === 1 ? '' : 's'} need a plain-English definition:</strong> `
          + `${needsDefinition.map(cleanLine).join(', ')}. ArcGIS does not require them, FGDC does.`
      })
    ]) : null,
    el('div', { class: 'actions' }, [
      el('button', {
        type: 'button',
        text: 'Continue: answer a few questions',
        on: { click: () => setStep('describe') }
      }),
      el('div', {}, [
        state.workspace && state.workspace.datasets.length > 1 ? el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Pick a different dataset',
          on: {
            click: () => {
              setProject(createProject(), { hasImport: false });
              context.refresh();
            }
          }
        }) : null,
        el('button', {
          type: 'button',
          class: 'secondary',
          text: 'Upload a different file',
          on: {
            click: () => {
              clearDraft();
              context.refresh();
            }
          }
        })
      ])
    ])
  ]);
}

// -----------------------------------------------------------------------------
// Dataset picker
// -----------------------------------------------------------------------------

/**
 * Build the project for one workspace dataset, folding in any metadata the
 * export embedded for it.
 */
function chooseDataset(dataset, context) {
  const workspace = state.workspace;
  const stats = workspace.stats ? workspace.stats[dataset.name] : null;
  let metadataProject = null;
  if (dataset.embeddedMetadata) {
    try {
      metadataProject = importMetadataXml(dataset.embeddedMetadata, createProject());
    } catch {
      // Embedded metadata that will not parse is not worth failing the import
      // over. The schema is the part that matters.
      metadataProject = null;
    }
  }
  const project = datasetToProject(dataset, { stats, metadataProject, base: createProject() });
  setProject(project);
  toast(`Loaded ${dataset.name}`);
  context.refresh();
}

function datasetPicker(context) {
  const workspace = state.workspace;
  const datasets = workspace.datasets;

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Choose a dataset' }),
    el('p', {
      class: 'panel-intro',
      text: `This workspace holds ${datasets.length} datasets. Metadata is written for one dataset at a time, so pick the one you are publishing. You can come back and do another afterwards.`
    }),
    workspace.includesData
      ? el('div', { class: 'callout ok' }, [
        el('p', { html: '<strong>This export includes the data.</strong> Feature counts below are counted from it, and numeric value ranges are measured rather than estimated.' })
      ])
      : el('div', { class: 'callout' }, [
        el('p', { html: '<strong>This export is schema only.</strong> That is fine, but you will be asked for the feature count, which the file does not carry.' })
      ]),
    el('div', {}, datasets.map((dataset) => {
      const stats = workspace.stats ? workspace.stats[dataset.name] : null;
      return el('div', { class: 'record' }, [
        el('div', { class: 'record-head' }, [
          el('h4', { text: dataset.alias && dataset.alias !== dataset.name ? `${dataset.alias} (${dataset.name})` : dataset.name }),
          el('button', {
            type: 'button',
            text: 'Use this dataset',
            on: { click: () => chooseDataset(dataset, context) }
          })
        ]),
        el('p', { class: 'hint', text: describeDataset(dataset, stats) })
      ]);
    })),
    el('div', { class: 'actions' }, [
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Upload a different file',
        on: {
          click: () => {
            clearDraft();
            context.refresh();
          }
        }
      })
    ])
  ]);
}

// -----------------------------------------------------------------------------
// Reading files
// -----------------------------------------------------------------------------

function showError(message, detail) {
  const holder = document.querySelector('#import-error');
  if (!holder) return;
  setChildren(holder, [
    el('div', { class: 'callout error' }, [
      el('p', { html: `<strong>${message}</strong> ${detail ? cleanLine(detail) : ''}` }),
      el('p', { text: 'Export again from ArcGIS Pro: Catalog pane, right-click the geodatabase or feature class, Export, XML Workspace Document. A metadata export from the layer Metadata tab works too.' })
    ])
  ]);
}

function progressPanel() {
  const bar = el('div', {
    style: 'height:8px;background:var(--lime);width:0%;transition:width 0.15s ease;border-radius:4px;'
  });
  const label = el('p', { class: 'hint', text: 'Reading...' });
  const panel = el('div', { class: 'callout' }, [
    el('p', { html: '<strong>Reading the workspace document.</strong> Large exports are read in pieces so the browser stays responsive.' }),
    el('div', { style: 'background:#e7ece5;border-radius:4px;overflow:hidden;' }, [bar]),
    label
  ]);
  return {
    panel,
    update(fraction, note) {
      bar.style.width = `${Math.round(fraction * 100)}%`;
      label.textContent = note || `${Math.round(fraction * 100)}%`;
    }
  };
}

/**
 * Stream a workspace document, then either pick the only dataset or ask.
 */
async function loadWorkspace(file, context) {
  const holder = document.querySelector('#import-error');
  const progress = progressPanel();
  if (holder) setChildren(holder, [progress.panel]);

  try {
    const megabytes = file.size / 1048576;
    const workspace = await readWorkspaceDocument(fileChunks(file), {
      totalBytes: file.size,
      onProgress: (fraction) => progress.update(
        fraction,
        megabytes > 8
          ? `${Math.round(fraction * 100)}% of ${megabytes.toFixed(0)} MB`
          : `${Math.round(fraction * 100)}%`
      )
    });

    if (!workspace.datasets.length) {
      showError('That workspace document has no feature classes or tables in it.', '');
      return;
    }

    setWorkspace(workspace);
    if (workspace.datasets.length === 1) {
      chooseDataset(workspace.datasets[0], context);
    } else {
      context.refresh();
    }
  } catch (error) {
    showError('Could not read that workspace document.', error.message);
  }
}

/**
 * Read a metadata record, which is small enough to take in one piece.
 */
function loadMetadataText(text, context, sourceName) {
  try {
    setProject(importMetadataXml(text, createProject()));
    toast(`Loaded ${sourceName}`);
    context.refresh();
  } catch (error) {
    showError('That file could not be read as XML.', error.message);
  }
}

/**
 * Decide what kind of document this is from its first few kilobytes, then hand
 * it to the right reader.
 */
async function ingestFile(file, context) {
  try {
    const head = await file.slice(0, 16384).text();
    const kind = detectDocumentKind(head);

    if (kind === 'workspace') {
      await loadWorkspace(file, context);
      return;
    }
    if (kind === 'metadata') {
      loadMetadataText(await file.text(), context, file.name);
      return;
    }
    showError('That file is not an XML Workspace Document or a metadata record.',
      'The root element was not one this tool recognizes.');
  } catch (error) {
    showError('That file could not be read.', error.message);
  }
}

async function loadSample(kind, context) {
  try {
    const response = await fetch(SAMPLES[kind].url);
    if (!response.ok) throw new Error(`sample not available (${response.status})`);
    const text = await response.text();
    if (kind === 'workspace') {
      // Wrap the text as a File so it goes through exactly the same path a real
      // upload does.
      await ingestFile(new File([text], 'workspace-export-tortoise.xml', { type: 'text/xml' }), context);
    } else {
      loadMetadataText(text, context, SAMPLES[kind].label);
    }
  } catch {
    toast('Example file could not be loaded');
  }
}

// -----------------------------------------------------------------------------
// Panel
// -----------------------------------------------------------------------------

export function render(context) {
  // A workspace is loaded but no dataset chosen yet.
  if (state.workspace && !state.hasImport) return datasetPicker(context);

  if (state.hasImport && state.project.importSummary) {
    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Uploaded data' }),
      el('p', { class: 'panel-intro', text: 'Here is what came out of your export.' }),
      importReport(state.project, context)
    ]);
  }

  const panel = el('section', { class: 'panel' });

  const fileInput = el('input', {
    type: 'file',
    accept: '.xml,text/xml,application/xml',
    class: 'visually-hidden',
    id: 'file-input'
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) ingestFile(file, context);
  });

  const dropzone = el('div', { class: 'dropzone' }, [
    el('h3', { text: 'Drop your ArcGIS export here' }),
    el('p', { text: 'An XML Workspace Document, or a metadata export. Nothing is uploaded to a server; the file is read in this browser.' }),
    el('button', { type: 'button', text: 'Choose a file', on: { click: () => fileInput.click() } }),
    fileInput
  ]);

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-over');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-over');
    });
  }
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) ingestFile(file, context);
  });

  const projectInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
  projectInput.addEventListener('change', async () => {
    const file = projectInput.files && projectInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setProject({ ...createProject(), ...(parsed.project || parsed) }, { hasImport: true });
      toast('Draft loaded');
      setStep('review');
    } catch {
      toast('That draft file could not be read');
    }
  });

  panel.append(
    el('h2', { text: 'Start a metadata record' }),
    el('p', {
      class: 'panel-intro',
      text: 'Upload what ArcGIS gives you. The tool reads the field schema, domains, geometry, coordinate system and extent, counts the features if the data are included, then asks you for what FGDC needs and ArcGIS does not collect.'
    }),
    dropzone,
    el('div', { id: 'import-error' }),

    el('h3', { text: 'Which export should I use?' }),
    el('table', { class: 'data' }, [
      el('tr', {}, [
        el('th', { text: 'Export' }),
        el('th', { text: 'How to get it' }),
        el('th', { text: 'Use it when' })
      ]),
      el('tr', {}, [
        el('td', { html: '<strong>XML Workspace Document</strong><br>recommended' }),
        el('td', { text: 'Catalog pane, right-click the geodatabase or feature class, Export, XML Workspace Document. Include the data if you can.' }),
        el('td', { text: 'Almost always, and especially when the layer has no metadata yet. It carries the real schema, the domains, and a true feature count.' })
      ]),
      el('tr', {}, [
        el('td', { html: '<strong>Metadata export</strong>' }),
        el('td', { text: 'Right-click the layer, View Metadata, then Export on the Metadata tab.' }),
        el('td', { text: 'When someone has already written a title, abstract and lineage you want to keep.' })
      ])
    ]),
    el('p', { class: 'hint', text: 'A workspace export that carries metadata gets both: the schema from the geodatabase and the words from the metadata record.' }),

    el('div', { class: 'actions' }, [
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
        el('button', {
          type: 'button',
          class: 'secondary',
          text: 'Load the example workspace',
          on: { click: () => loadSample('workspace', context) }
        }),
        el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Load the example metadata record',
          on: { click: () => loadSample('metadata', context) }
        })
      ]),
      el('div', {}, [
        el('button', { type: 'button', class: 'ghost', text: 'Open a saved draft', on: { click: () => projectInput.click() } }),
        el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Start without an upload',
          on: {
            click: () => {
              setProject({ ...createProject(), importSummary: null }, { hasImport: true });
              setStep('identification');
              toast('Empty record started. Add the real field schema on the Attributes step.');
            }
          }
        }),
        projectInput
      ])
    ])
  );

  return panel;
}
