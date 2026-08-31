// =============================================================================
// STEP 4: SPATIAL DOMAIN, ORGANIZATION AND REFERENCE
// =============================================================================
// idinfo/spdom, spdoinfo and spref. Rule 6 of the standard: coordinate system,
// extent and feature count are dataset facts, never defaults, so anything the
// upload did not supply is asked for here rather than assumed.
// =============================================================================

import { el, setChildren } from '../dom.js';
import { state } from '../store.js';
import { field, textInput, textArea, select, group } from '../controls.js';
import { CRS_REGISTRY, crsByEpsg, crsDisplay } from '../../lib/crs.js';
import { documentedCrsFor } from '../../lib/fgdc.js';

const GEOMETRY_TYPES = ['Polygon', 'Polyline', 'Point', 'Multipoint'];

function crsItems() {
  return CRS_REGISTRY.map((entry) => ({
    value: entry.epsg,
    label: entry.epsg ? `${entry.label} (EPSG ${entry.epsg})` : entry.label
  }));
}

export function render(context) {
  const project = state.project;

  // --- Vector or raster specific rows ---------------------------------------
  const typeRow = el('div', { class: 'grid-3' });
  const drawTypeRow = () => {
    if (project.dataType === 'Raster') {
      setChildren(typeRow, [
        field('Cell size', textInput('rasterCellSize', { placeholder: '30 meters' })),
        field('Columns', textInput('rasterColumnCount', { inputmode: 'numeric' })),
        field('Rows', textInput('rasterRowCount', { inputmode: 'numeric' }))
      ]);
    } else {
      setChildren(typeRow, [
        field('Geometry type', select('geometryType', {
          items: [{ value: '', label: 'Select a geometry type' }, ...GEOMETRY_TYPES]
        })),
        field('Feature count', textInput('featureCount', { inputmode: 'numeric', placeholder: '1478' }),
          'The number of features in the published layer.')
      ]);
    }
  };
  drawTypeRow();

  // --- Custom coordinate system ---------------------------------------------
  const customBlock = el('div', {});
  const drawCustom = () => {
    // The registry's "Other / not listed" entry has no EPSG code, so an
    // unresolved lookup is exactly the case that needs the custom fields.
    const usesCustom = !crsByEpsg(project.analysisCrsEpsg);
    if (!usesCustom) {
      setChildren(customBlock, []);
      return;
    }
    setChildren(customBlock, [el('div', { class: 'callout' }, [
      el('p', { html: '<strong>Describe the coordinate system.</strong> It is not one of the systems this tool knows, so the record will carry the name, EPSG code and datum you give here.' }),
      el('div', { class: 'grid-2' }, [
        field('Coordinate system name', textInput('customCrs.label', { placeholder: 'NAD 1983 StatePlane Nevada East' })),
        field('EPSG code', textInput('customCrs.epsg', { inputmode: 'numeric', placeholder: '32107' }))
      ]),
      el('div', { class: 'grid-2' }, [
        field('Type', select('customCrs.kind', {
          items: [{ value: 'planar', label: 'Projected' }, { value: 'geographic', label: 'Geographic' }]
        })),
        field('Datum', select('customCrs.datum', {
          items: [
            { value: 'nad83', label: 'North American Datum of 1983' },
            { value: 'nad83_2011', label: 'North American Datum of 1983 (2011)' },
            { value: 'wgs84', label: 'World Geodetic System 1984' }
          ]
        }))
      ]),
      field('Well-known text', textArea('customCrs.wkt', { rows: 3, placeholder: 'Optional. Paste the WKT from ArcGIS Pro layer properties.' }),
        'Carried into the record so the projection is unambiguous even though FGDC does not enumerate it.')
    ])]);
  };

  const documentedNote = el('p', { class: 'hint' });
  const refreshDocumentedNote = () => {
    const documented = documentedCrsFor(project);
    documentedNote.textContent = documented
      ? `The spref block will describe: ${crsDisplay(documented)}`
      : 'No coordinate system selected.';
  };

  const onCrsChange = () => {
    drawCustom();
    refreshDocumentedNote();
  };
  drawCustom();
  refreshDocumentedNote();

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Spatial information' }),
    el('p', { class: 'panel-intro', text: 'Extent, data organization and coordinate systems. Confirm every value here even when the upload filled it in.' }),

    group('Data organization', [
      field('Data type', select('dataType', {
        items: ['Vector', 'Raster'],
        onChange: drawTypeRow
      })),
      typeRow
    ]),

    group('Bounding coordinates (decimal degrees)', [
      el('p', { class: 'hint', text: 'FGDC requires the extent in decimal degrees regardless of the projection the data are stored in. Western hemisphere longitudes are negative.' }),
      el('div', { class: 'grid-4' }, [
        field('West', textInput('westbc', { placeholder: '-117.85' })),
        field('East', textInput('eastbc', { placeholder: '-116.01' })),
        field('North', textInput('northbc', { placeholder: '37.19' })),
        field('South', textInput('southbc', { placeholder: '35.99' }))
      ]),
      field('Extent description', textInput('extentDescription'),
        'Plain-language extent for the Portal technical specifications table.')
    ]),

    group('Coordinate systems', [
      el('p', { class: 'hint', text: 'The standard keeps source data in NAD 1983 UTM Zone 11N and publishes hosted services in Web Mercator. Both are recorded: one in spref, the other in the final lineage step.' }),
      el('div', { class: 'grid-2' }, [
        field('Source and analysis coordinate system', select('analysisCrsEpsg', {
          items: crsItems(),
          onChange: onCrsChange
        }), 'The coordinate system of the source geodatabase.'),
        field('Published service coordinate system', select('serviceCrsEpsg', {
          items: crsItems(),
          onChange: onCrsChange
        }), 'The coordinate system of the hosted layer in Portal or AGOL.')
      ]),
      customBlock,
      field('Which one should spref describe?', select('documentedCrs', {
        items: [
          { value: 'service', label: 'The published service coordinate system' },
          { value: 'analysis', label: 'The source geodatabase coordinate system' }
        ],
        onChange: refreshDocumentedNote
      }), 'Choose the service when the XML is attached to a hosted layer, which is the usual case.'),
      documentedNote
    ])
  ]);
}
