// =============================================================================
// STEP 1: UPLOAD THE ARCGIS PRO EXPORT
// =============================================================================
// Everything downstream keys off this file. In particular the field schema:
// rule 2 of the standard forbids inventing an attribute table, so the fields
// come from the export or they are typed in by hand from the real schema.
// =============================================================================

import { el, toast, setChildren } from '../dom.js';
import { state, setProject, setStep, clearDraft } from '../store.js';
import { importMetadataXml } from '../../lib/import.js';
import { createProject } from '../../lib/model.js';
import { cleanLine } from '../../lib/text.js';

const SAMPLE_URL = 'samples/pro-export-desert-tortoise.xml';

function summaryCard(value, label) {
  return el('div', { class: 'summary-card' }, [
    el('span', { class: 'value', text: String(value) }),
    el('span', { class: 'label', text: label })
  ]);
}

/**
 * What the upload gave us and what the user still has to answer.
 */
function importReport(project, context) {
  const summary = project.importSummary;
  if (!summary) return null;

  const roles = summary.fieldRoles || { user: 0, system: 0, editor: 0 };
  const needsDefinition = summary.fieldsMissingDefinition || [];

  return el('div', {}, [
    el('div', { class: 'callout ok' }, [
      el('p', { html: `<strong>Read ${summary.format} record.</strong> The values below were taken from your file. Anything not found is asked for in the steps that follow.` })
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
    needsDefinition.length ? el('div', { class: 'callout warn' }, [
      el('p', {
        html: `<strong>${needsDefinition.length} field${needsDefinition.length === 1 ? '' : 's'} need a plain-English definition:</strong> ${needsDefinition.map(cleanLine).join(', ')}. `
          + 'ArcGIS does not require them, FGDC does.'
      })
    ]) : null,
    el('div', { class: 'actions' }, [
      el('button', {
        type: 'button',
        text: 'Continue to Identification',
        on: { click: () => setStep('identification') }
      }),
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

/**
 * Read a File object and load it into the store.
 */
async function ingestFile(file, context) {
  const text = await file.text();
  loadXmlText(text, context, file.name);
}

function loadXmlText(text, context, sourceName = 'uploaded file') {
  try {
    const project = importMetadataXml(text, createProject());
    setProject(project);
    toast(`Loaded ${sourceName}`);
    context.refresh();
  } catch (error) {
    toast('That file could not be read as XML');
    const holder = document.querySelector('#import-error');
    if (holder) {
      setChildren(holder, [el('div', { class: 'callout error' }, [
        el('p', { html: `<strong>Could not read that file.</strong> ${cleanLine(error.message)}` }),
        el('p', { text: 'Export the metadata from ArcGIS Pro again (Catalog pane, right-click the layer, Export Metadata, or the item Metadata tab) and upload the resulting .xml file.' })
      ])]);
    }
  }
}

export function render(context) {
  const panel = el('section', { class: 'panel' });

  if (state.hasImport && state.project.importSummary) {
    panel.append(
      el('h2', { text: 'Uploaded metadata' }),
      el('p', { class: 'panel-intro', text: 'Here is what came out of your export.' }),
      importReport(state.project, context)
    );
    return panel;
  }

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
    el('h3', { text: 'Drop your ArcGIS Pro metadata export here' }),
    el('p', { text: 'An .xml file exported from ArcGIS Pro, or any FGDC CSDGM or ISO 19139 record. Nothing is uploaded to a server, the file is read in this browser.' }),
    el('button', {
      type: 'button',
      text: 'Choose a file',
      on: { click: () => fileInput.click() }
    }),
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
      const project = { ...createProject(), ...(parsed.project || parsed) };
      setProject(project, { hasImport: true });
      toast('Draft loaded');
      setStep('review');
    } catch {
      toast('That draft file could not be read');
    }
  });

  panel.append(
    el('h2', { text: 'Start a metadata record' }),
    el('p', { class: 'panel-intro', text: 'Upload the metadata ArcGIS Pro exported for your layer. The tool reads the field schema, extent, coordinate system and everything else the export carries, then asks you for what FGDC needs and ArcGIS does not collect.' }),
    dropzone,
    el('div', { id: 'import-error' }),
    el('h3', { text: 'How to get the export from ArcGIS Pro' }),
    el('ol', {}, [
      el('li', { text: 'In the Catalog pane, right-click the feature class or layer and choose View Metadata.' }),
      el('li', { text: 'On the Metadata tab of the ribbon, click Export, and choose the FGDC CSDGM Metadata or ArcGIS Metadata format.' }),
      el('li', { text: 'Save the .xml file somewhere you can find it, then drop it above.' })
    ]),
    el('div', { class: 'actions' }, [
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Load the example export',
        on: {
          click: async () => {
            try {
              const response = await fetch(SAMPLE_URL);
              if (!response.ok) throw new Error(`sample not available (${response.status})`);
              loadXmlText(await response.text(), context, 'the example export');
            } catch (error) {
              toast('Example file could not be loaded');
            }
          }
        }
      }),
      el('div', {}, [
        el('button', {
          type: 'button',
          class: 'ghost',
          text: 'Open a saved draft',
          on: { click: () => projectInput.click() }
        }),
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
