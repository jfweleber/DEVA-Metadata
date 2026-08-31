// =============================================================================
// STEP 2: IDENTIFICATION
// =============================================================================
// Citation, description, time period, status and the point of contact. These
// map onto idinfo/citation, idinfo/descript, idinfo/timeperd, idinfo/status
// and idinfo/ptcontac.
// =============================================================================

import { el, setChildren } from '../dom.js';
import { state } from '../store.js';
import { field, textInput, textArea, select, dateInput, tagEditor, group, commit } from '../controls.js';
import { toInputDate, toFgdcDate } from '../../lib/text.js';
import { DEVA_CONTACT } from '../../lib/model.js';

const helpers = { toInputDate, toFgdcDate };

const GEOFORMS = [
  'vector digital data',
  'raster digital data',
  'tabular digital data',
  'map',
  'remote-sensing image',
  'document'
];

const PROGRESS = ['Complete', 'In work', 'Planned'];

const UPDATE_FREQUENCIES = [
  'As needed', 'Annually', 'Semiannually', 'Quarterly', 'Monthly', 'Weekly',
  'Daily', 'Irregular', 'None planned', 'Unknown'
];

export function render(context) {
  const project = state.project;

  const timeRow = el('div', { class: 'grid-2' });
  const drawTimeRow = () => {
    if (project.timePeriodType === 'range') {
      setChildren(timeRow, [
        field('Begin date', dateInput('beginDate', { helpers })),
        field('End date', dateInput('endDate', { helpers }))
      ]);
    } else {
      setChildren(timeRow, [
        field('Date of the content', dateInput('calendarDate', { helpers }),
          'The date the data describe, which is not always the publication date.')
      ]);
    }
  };
  drawTimeRow();

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Identification' }),
    el('p', { class: 'panel-intro', text: 'The citation and description that head the FGDC record and open the Portal item page.' }),

    group('Citation', [
      field('Layer title', textInput('title', { placeholder: 'DEVA GIS Desert Tortoise Core Habitat' }),
        'The full display name of the layer, as it should read in Portal.'),
      el('div', { class: 'grid-2' }, [
        field('Publication date', dateInput('pubdate', { helpers })),
        field('Edition', textInput('edition', { placeholder: 'Optional, for example 2026 revision' }))
      ]),
      field('Originator', tagEditor('originators', {
        placeholder: 'Add an originating organization, then press Enter',
        suggestions: ['National Park Service, Death Valley National Park', 'Great Basin Institute']
      }), 'Who created the data. Cite an outside agency here when the data came from one, and still list DEVA as the contact below.'),
      el('div', { class: 'grid-2' }, [
        field('Geospatial data presentation form', select('geoform', { items: GEOFORMS })),
        field('Online link', textInput('onlink', { type: 'url', placeholder: 'https://npsdatastore.maps.arcgis.com/...' }),
          'The Portal or AGOL item URL, if it already exists.')
      ])
    ]),

    group('Description', [
      field('Abstract', textArea('abstract', {
        rows: 7,
        placeholder: 'What the dataset contains, how it was made, and the geographic scope. Two to three paragraphs. Leave a blank line between paragraphs.'
      }), 'Goes into idinfo/descript/abstract, and becomes the Overview section of the Portal description unless you write a different overview later.'),
      field('Purpose', textArea('purpose', {
        rows: 3,
        placeholder: 'What the data are intended to be used for.'
      })),
      field('Supplemental information', textArea('supplemental', {
        rows: 3,
        placeholder: 'Optional. Anything a user should know that does not fit the abstract.'
      }))
    ]),

    group('Time period and status', [
      el('div', { class: 'grid-2' }, [
        field('Time period type', select('timePeriodType', {
          items: [
            { value: 'single', label: 'Single date' },
            { value: 'range', label: 'Date range' }
          ],
          onChange: drawTimeRow
        })),
        field('Currentness reference', select('currentness', {
          items: ['publication date', 'ground condition', 'observed date']
        }))
      ]),
      timeRow,
      el('div', { class: 'grid-2' }, [
        field('Progress', select('progress', { items: PROGRESS })),
        field('Update frequency', select('updateFrequency', { items: UPDATE_FREQUENCIES }))
      ])
    ]),

    group('Point of contact', [
      el('p', { class: 'hint', text: 'Section 6 of the DEVA standard. Used for idinfo/ptcontac, the distributor, the metadata contact, and the Portal contact block.' }),
      el('div', { class: 'grid-2' }, [
        field('Organization', textInput('contact.organization')),
        field('Contact person', textInput('contact.person'))
      ]),
      el('div', { class: 'grid-2' }, [
        field('Position', textInput('contact.position')),
        field('Phone', textInput('contact.phone'))
      ]),
      el('div', { class: 'grid-4' }, [
        field('Address', textInput('contact.address')),
        field('City', textInput('contact.city')),
        field('State', textInput('contact.state')),
        field('ZIP', textInput('contact.postal'))
      ]),
      field('Email', textInput('contact.email', { type: 'email', placeholder: 'Optional' })),
      field('Credits', textArea('contact.credits', { rows: 2 }),
        'Goes into idinfo/datacred. Name the originating division or agency plus the cooperative agreement.'),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Reset to the standard DEVA contact block',
        on: {
          click: () => {
            state.project.contact = { ...DEVA_CONTACT };
            commit();
            context.refresh();
          }
        }
      })
    ])
  ]);
}
