// =============================================================================
// STEP 8: REVIEW AND DOWNLOAD
// =============================================================================
// Both artifacts, side by side, with the Section 8 checklist and the publishing
// steps from Section 4. The standard is explicit that the two are authored
// together and neither ships alone.
// =============================================================================

import { el, toast, copyText, downloadText, setChildren } from '../dom.js';
import { state, setStep } from '../store.js';
import { generateFgdcXml } from '../../lib/fgdc.js';
import { generateHtmlSnippet } from '../../lib/html.js';
import { validateProject, deliverableChecklist } from '../../lib/validate.js';
import { slugify } from '../../lib/text.js';

const STEP_LABELS = {
  identification: 'Identification',
  contact: 'Identification',
  keywords: 'Keywords',
  spatial: 'Spatial',
  lineage: 'Lineage',
  attributes: 'Attributes',
  description: 'Description',
  review: 'Review'
};

function issueList(issues, context) {
  return el('ul', { class: 'issue-list' }, issues.map((item) => el('li', { class: item.level }, [
    el('div', {}, [
      el('span', { text: item.message }),
      item.detail ? el('span', { class: 'detail', text: item.detail }) : null
    ]),
    item.step && item.step !== 'review' ? el('button', {
      type: 'button',
      class: 'ghost',
      text: `Fix in ${STEP_LABELS[item.step] || item.step}`,
      on: {
        click: () => setStep(item.step === 'contact' ? 'identification' : item.step)
      }
    }) : null
  ])));
}

export function render(context) {
  const project = state.project;
  const xml = generateFgdcXml(project);
  const html = generateHtmlSnippet(project);
  const result = validateProject(project);
  const checklist = deliverableChecklist(project);
  const base = slugify(project.entityName || project.title);

  // --- Output tabs ----------------------------------------------------------
  const outputHolder = el('div', {});
  const tabs = [
    { id: 'xml', label: 'FGDC XML' },
    { id: 'html', label: 'HTML snippet' },
    { id: 'preview', label: 'Snippet preview' }
  ];
  let activeTab = 'xml';

  const tabBar = el('div', { class: 'output-tabs', role: 'tablist' });

  const drawOutput = () => {
    setChildren(tabBar, [...tabs.map((tab) => el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(tab.id === activeTab),
      text: tab.label,
      on: {
        click: () => {
          activeTab = tab.id;
          drawOutput();
        }
      }
    }))]);

    if (activeTab === 'preview') {
      // Rendered in an iframe so Portal-bound markup cannot restyle this page.
      const frame = el('iframe', {
        class: 'preview',
        title: 'Portal description preview',
        sandbox: '',
        srcdoc: `<!doctype html><html><head><meta charset="utf-8">`
          + `<style>body{font-family:"Avenir Next","Segoe UI",Arial,sans-serif;margin:18px;color:#323232;background:#fff;}</style>`
          + `</head><body>${html}</body></html>`
      });
      setChildren(outputHolder, [frame]);
    } else {
      setChildren(outputHolder, [el('pre', { class: 'code', text: activeTab === 'xml' ? xml : html })]);
    }
  };
  drawOutput();

  // --- Downloads ------------------------------------------------------------
  const downloads = el('div', { class: 'actions' }, [
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
      el('button', {
        type: 'button',
        text: 'Download FGDC XML',
        on: {
          click: () => {
            downloadText(`${base}.xml`, xml, 'application/xml');
            toast('XML downloaded');
          }
        }
      }),
      el('button', {
        type: 'button',
        text: 'Copy HTML snippet',
        on: {
          click: async () => {
            toast(await copyText(html) ? 'Snippet copied, paste it into the Description HTML editor' : 'Copy failed, select the text instead');
          }
        }
      }),
      el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Download HTML snippet',
        on: {
          click: () => {
            downloadText(`${base}_portal_description.html`, html, 'text/html');
            toast('Snippet downloaded');
          }
        }
      })
    ]),
    el('button', {
      type: 'button',
      class: 'ghost',
      text: 'Save draft (.json)',
      on: {
        click: () => {
          downloadText(`${base}_draft.json`, JSON.stringify({ project }, null, 2), 'application/json');
          toast('Draft saved. Reopen it from the upload step.');
        }
      }
    })
  ]);

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Review and download' }),
    el('p', { class: 'panel-intro', text: 'Both artifacts are authored together. The XML is authoritative, the HTML is derived from it.' }),

    result.errors.length
      ? el('div', { class: 'callout error' }, [
        el('p', { html: `<strong>${result.errors.length} item${result.errors.length === 1 ? '' : 's'} still need attention.</strong> You can download anyway, but the record is not compliant until these are resolved.` }),
        issueList(result.errors, context)
      ])
      : el('div', { class: 'callout ok' }, [
        el('p', { html: '<strong>No blocking problems found.</strong> Every FGDC required element is present and the DEVA checklist passes.' })
      ]),

    result.warnings.length
      ? el('details', { class: 'record' }, [
        el('summary', { text: `${result.warnings.length} suggestion${result.warnings.length === 1 ? '' : 's'}` }),
        issueList(result.warnings, context)
      ])
      : null,

    el('h3', { text: 'Deliverable checklist' }),
    el('ul', { class: 'checklist' }, checklist.map((item) => el('li', {
      class: item.pass ? 'pass' : 'fail',
      text: item.label
    }))),

    el('h3', { text: 'Artifacts' }),
    tabBar,
    outputHolder,
    downloads,

    el('h3', { text: 'Publishing steps' }),
    el('ol', {}, [
      el('li', { text: 'Save the XML alongside the source geodatabase.' }),
      el('li', { text: 'In ArcGIS Pro, right-click the layer, View Metadata, Import, and select the file with type FROM_FGDC.' }),
      el('li', { text: 'Share the layer to Portal as a Hosted Feature Layer.' }),
      el('li', { text: 'On the Portal item page, open the Metadata tab, Import, and upload the XML with format FGDC CSDGM.' }),
      el('li', { text: 'On the item Description tab, switch to the HTML source view and paste the snippet, then save.' }),
      el('li', { text: 'Check the rendering: headings, table colors and callout boxes.' }),
      el('li', { text: 'Fill in Summary, Tags and Keywords to match the theme and place keywords in this record.' })
    ]),
    el('div', { class: 'callout warn' }, [
      el('p', { html: '<strong>Known issue.</strong> A service name containing the word "Tract" fails to publish to Portal with a generic error. Rename the service before publishing, for example DEVA GIS Parcels.' })
    ])
  ]);
}
