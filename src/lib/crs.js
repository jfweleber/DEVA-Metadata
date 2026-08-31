// =============================================================================
// COORDINATE REFERENCE SYSTEM REGISTRY
// =============================================================================
// FGDC-STD-001-1998 does not accept a bare projection name in <spref>. It wants
// the grid system or projection parameters spelled out, plus the geodetic model.
// This module holds the systems DEVA actually publishes in, and builds a valid
// <horizsys> block for each one. Anything not listed falls back to <otherprj>,
// which is the standard's own escape hatch for projections it does not enumerate.
//
// House rule from the standard: analysis and source geodatabases are NAD 1983
// UTM Zone 11N (EPSG 26911); Portal hosted services are WGS 1984 Web Mercator
// Auxiliary Sphere (EPSG 3857).
// =============================================================================

const DATUMS = {
  nad83: {
    horizdn: 'North American Datum of 1983',
    ellips: 'Geodetic Reference System 80',
    semiaxis: '6378137.0',
    denflat: '298.257222101'
  },
  nad83_2011: {
    horizdn: 'North American Datum of 1983 (2011)',
    ellips: 'Geodetic Reference System 80',
    semiaxis: '6378137.0',
    denflat: '298.257222101'
  },
  wgs84: {
    horizdn: 'World Geodetic System 1984',
    ellips: 'WGS 84',
    semiaxis: '6378137.0',
    denflat: '298.257223563'
  }
};

/**
 * Central meridian for a northern-hemisphere UTM zone.
 */
function utmCentralMeridian(zone) {
  return 6 * Number(zone) - 183;
}

function utmEntry(zone, datumKey, epsg, label) {
  return {
    epsg: String(epsg),
    label,
    kind: 'planar',
    datum: datumKey,
    units: 'meters',
    absres: '0.0001',
    planar: {
      gridsys: {
        gridsysn: 'Universal Transverse Mercator',
        zoneElement: 'utm',
        zoneLabel: 'utmzone',
        zoneValue: String(zone),
        projection: ['transmer', [
          ['sfctrmer', '0.9996'],
          ['longcm', utmCentralMeridian(zone).toFixed(1)],
          ['latprjo', '0.0'],
          ['feast', '500000.0'],
          ['fnorth', '0.0']
        ]]
      }
    },
    // Aliases stay datum-specific: a WGS 1984 UTM zone is a different system and
    // must not resolve to the NAD 1983 entry.
    aliases: datumKey === 'wgs84'
      ? [`WGS_1984_UTM_Zone_${zone}N`, `WGS 1984 UTM Zone ${zone}N`]
      : [`NAD_1983_UTM_Zone_${zone}N`, `NAD 1983 UTM Zone ${zone}N`]
  };
}

export const CRS_REGISTRY = [
  utmEntry(11, 'nad83', 26911, 'NAD 1983 UTM Zone 11N'),
  utmEntry(12, 'nad83', 26912, 'NAD 1983 UTM Zone 12N'),
  utmEntry(10, 'nad83', 26910, 'NAD 1983 UTM Zone 10N'),
  {
    ...utmEntry(11, 'nad83_2011', 6339, 'NAD 1983 (2011) UTM Zone 11N'),
    aliases: ['NAD_1983_2011_UTM_Zone_11N', 'NAD_1983(2011)_UTM_Zone_11N']
  },
  {
    epsg: '3857',
    label: 'WGS 1984 Web Mercator Auxiliary Sphere',
    kind: 'planar',
    datum: 'wgs84',
    units: 'meters',
    absres: '0.0001',
    planar: {
      mapproj: {
        mapprojn: 'Mercator',
        projection: ['mercator', [
          ['stdparll', '0.0'],
          ['longcm', '0.0'],
          ['feast', '0.0'],
          ['fnorth', '0.0']
        ]],
        note: 'WGS 1984 Web Mercator Auxiliary Sphere. Sphere-based Mercator projection used by ArcGIS Portal and ArcGIS Online hosted services.'
      }
    },
    aliases: [
      'WGS_1984_Web_Mercator_Auxiliary_Sphere',
      'WGS 1984 Web Mercator Auxiliary Sphere',
      'Web Mercator',
      'WGS_1984_Web_Mercator'
    ]
  },
  {
    epsg: '4326',
    label: 'WGS 1984 Geographic (decimal degrees)',
    kind: 'geographic',
    datum: 'wgs84',
    units: 'Decimal degrees',
    absres: '0.000001',
    aliases: ['GCS_WGS_1984', 'WGS 84', 'WGS_1984']
  },
  {
    epsg: '4269',
    label: 'NAD 1983 Geographic (decimal degrees)',
    kind: 'geographic',
    datum: 'nad83',
    units: 'Decimal degrees',
    absres: '0.000001',
    aliases: ['GCS_North_American_1983', 'NAD83', 'NAD_1983']
  },
  {
    epsg: '5070',
    label: 'NAD 1983 Albers Equal Area Conic (CONUS)',
    kind: 'planar',
    datum: 'nad83',
    units: 'meters',
    absres: '0.0001',
    planar: {
      mapproj: {
        mapprojn: 'Albers Conical Equal Area',
        projection: ['albers', [
          ['stdparll', '29.5'],
          ['stdparll', '45.5'],
          ['longcm', '-96.0'],
          ['latprjo', '23.0'],
          ['feast', '0.0'],
          ['fnorth', '0.0']
        ]]
      }
    },
    aliases: ['NAD_1983_Albers', 'USA_Contiguous_Albers_Equal_Area_Conic']
  },
  {
    epsg: '26945',
    label: 'NAD 1983 StatePlane California V (meters)',
    kind: 'planar',
    datum: 'nad83',
    units: 'meters',
    absres: '0.0001',
    planar: {
      gridsys: {
        gridsysn: 'State Plane Coordinate System 1983',
        zoneElement: 'spcs',
        zoneLabel: 'spcszone',
        zoneValue: '0405',
        projection: ['lambertc', [
          ['stdparll', '34.03333333333333'],
          ['stdparll', '35.46666666666667'],
          ['longcm', '-118.0'],
          ['latprjo', '33.5'],
          ['feast', '2000000.0'],
          ['fnorth', '500000.0']
        ]]
      }
    },
    aliases: ['NAD_1983_StatePlane_California_V_FIPS_0405', 'NAD_1983_StatePlane_California_V_FIPS_0405_Feet']
  },
  {
    epsg: '',
    label: 'Other / not listed (describe below)',
    kind: 'other',
    datum: 'nad83',
    units: 'meters',
    absres: '0.0001',
    aliases: []
  }
];

/**
 * Look up a registry entry by EPSG code.
 */
export function crsByEpsg(epsg) {
  const wanted = String(epsg || '').replace(/[^0-9]/g, '');
  if (!wanted) return null;
  return CRS_REGISTRY.find((entry) => entry.epsg === wanted) || null;
}

/**
 * Best-effort match of an ESRI or WKT coordinate system name to the registry.
 * ArcGIS writes names such as NAD_1983_UTM_Zone_11N or GCS_North_American_1983.
 */
export function crsByName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const target = normalize(raw);
  if (!target) return null;

  // 1. Exact name or alias match wins outright.
  for (const entry of CRS_REGISTRY) {
    if (!entry.epsg) continue;
    const candidates = [entry.label, ...(entry.aliases || [])].map(normalize);
    if (candidates.some((candidate) => candidate && candidate === target)) return entry;
  }

  // 2. Any UTM zone, including zones not pre-registered. This is checked before
  // loose matching so that NAD_1983_UTM_Zone_14N does not fall through to the
  // NAD 1983 geographic entry on the shared "NAD 1983" prefix.
  const utm = /utm[_\s]*zone[_\s]*(\d{1,2})\s*n?/i.exec(raw) || /zone[_\s]*(\d{1,2})n\b/i.exec(raw);
  if (utm) {
    const zone = Number(utm[1]);
    if (zone >= 1 && zone <= 60) {
      const isWgs = /wgs[_\s]*(19)?84/i.test(raw);
      const datumKey = isWgs ? 'wgs84' : 'nad83';
      const epsg = isWgs ? String(32600 + zone) : String(26900 + zone);
      const registered = crsByEpsg(epsg);
      if (registered) return registered;
      return {
        ...utmEntry(zone, datumKey, epsg, `${isWgs ? 'WGS 1984' : 'NAD 1983'} UTM Zone ${zone}N`)
      };
    }
  }

  // 3. Fall back to substring matching, but only on aliases distinctive enough
  // that a partial hit is meaningful.
  for (const entry of CRS_REGISTRY) {
    if (!entry.epsg) continue;
    const candidates = [entry.label, ...(entry.aliases || [])].map(normalize);
    if (candidates.some((candidate) => candidate.length >= 12 && target.includes(candidate))) return entry;
  }
  return null;
}

/**
 * Display label such as "NAD 1983 UTM Zone 11N (EPSG: 26911)".
 */
export function crsDisplay(crs) {
  if (!crs) return '';
  const label = String(crs.label || '').trim();
  const epsg = String(crs.epsg || '').trim();
  if (!label) return epsg ? `EPSG: ${epsg}` : '';
  return epsg ? `${label} (EPSG: ${epsg})` : label;
}

/**
 * Resolve the CRS a project should document, honoring a custom definition.
 */
export function resolveCrs(selection) {
  if (!selection) return null;
  const { epsg, label, kind, datum, units, wkt } = selection;
  const registered = crsByEpsg(epsg);
  if (registered && registered.kind !== 'other') {
    return label && label !== registered.label ? { ...registered, label } : registered;
  }
  return {
    epsg: String(epsg || ''),
    label: label || 'Custom coordinate system',
    kind: kind === 'geographic' ? 'geographic' : 'planar',
    datum: DATUMS[datum] ? datum : 'nad83',
    units: units || (kind === 'geographic' ? 'Decimal degrees' : 'meters'),
    absres: kind === 'geographic' ? '0.000001' : '0.0001',
    custom: true,
    wkt: wkt || ''
  };
}

/**
 * Build the FGDC <spref> element spec for a resolved CRS.
 * `resolution` optionally overrides the stated coordinate resolution.
 */
export function buildSpref(crs, options = {}) {
  if (!crs) return null;
  const datum = DATUMS[crs.datum] || DATUMS.nad83;
  const absres = options.absres || crs.absres || '0.0001';

  let systemBlock;
  if (crs.kind === 'geographic') {
    systemBlock = ['geograph', [
      ['latres', absres],
      ['longres', absres],
      ['geogunit', 'Decimal degrees']
    ]];
  } else {
    const planci = ['planci', [
      ['plance', 'coordinate pair'],
      ['coordrep', [
        ['absres', absres],
        ['ordres', absres]
      ]],
      ['plandu', crs.units || 'meters']
    ]];

    if (crs.planar && crs.planar.gridsys) {
      const grid = crs.planar.gridsys;
      systemBlock = ['planar', [
        ['gridsys', [
          ['gridsysn', grid.gridsysn],
          [grid.zoneElement, [
            [grid.zoneLabel, grid.zoneValue],
            grid.projection
          ]]
        ]],
        planci
      ]];
    } else if (crs.planar && crs.planar.mapproj) {
      const proj = crs.planar.mapproj;
      systemBlock = ['planar', [
        ['mapproj', [
          ['mapprojn', proj.mapprojn],
          proj.projection
        ]],
        planci
      ]];
    } else {
      // Not a projection the standard enumerates: use the FGDC escape hatch and
      // state the system by name so the record stays readable and valid.
      const description = [
        crs.label ? `Projected coordinate system: ${crs.label}.` : 'Projected coordinate system.',
        crs.epsg ? `EPSG code ${crs.epsg}.` : '',
        crs.wkt ? `Well-known text definition: ${crs.wkt}` : ''
      ].filter(Boolean).join(' ');
      systemBlock = ['planar', [
        ['mapproj', [
          ['mapprojn', crs.label || 'Other projection'],
          ['mapprojp', [['otherprj', description]]]
        ]],
        planci
      ]];
    }
  }

  return ['spref', [
    ['horizsys', [
      systemBlock,
      ['geodetic', [
        ['horizdn', datum.horizdn],
        ['ellips', datum.ellips],
        ['semiaxis', datum.semiaxis],
        ['denflat', datum.denflat]
      ]]
    ]]
  ]];
}
