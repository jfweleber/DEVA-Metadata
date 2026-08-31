// =============================================================================
// TEXT NORMALIZATION AND HOUSE STYLE
// =============================================================================
// Everything the user types passes through here on its way into the XML or the
// HTML snippet. Rule 5 of the DEVA standard is absolute: no em dashes anywhere,
// because Portal mangles special characters. The same pass also flattens the
// other characters Portal is unreliable with (curly quotes, ellipsis, non
// breaking spaces) so a paragraph pasted out of Word survives the trip.
// =============================================================================

const SUBSTITUTIONS = [
  // Em dash and horizontal bar become a spaced hyphen, matching house style.
  [/\s*[—―]\s*/g, ' - '],
  // En dash between digits is a numeric range; elsewhere it reads as a dash.
  [/(\d)\s*–\s*(\d)/g, '$1-$2'],
  [/\s*–\s*/g, ' - '],
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/…/g, '...'],
  [/[   ]/g, ' '],
  [/[‐‑‒−]/g, '-'],
  [/[​‌‍﻿]/g, '']
];

/**
 * Apply house style to a single value. Safe to call on undefined.
 */
export function clean(value) {
  if (value === undefined || value === null) return '';
  let out = String(value);
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  // Collapse runs of spaces and tabs but keep paragraph breaks intact.
  out = out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  return out.trim();
}

/**
 * Same as clean() but collapses all whitespace onto one line. Used for values
 * that must be a single line, such as titles and field names.
 */
export function cleanLine(value) {
  return clean(value).replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Report characters the standard forbids, so the UI can warn before download
 * rather than silently rewriting what the user typed.
 */
export function findStyleIssues(value) {
  const issues = [];
  const text = String(value == null ? '' : value);
  if (/[—―]/.test(text)) issues.push('em dash');
  if (/–/.test(text)) issues.push('en dash');
  if (/[‘’“”]/.test(text)) issues.push('curly quotes');
  if (/…/.test(text)) issues.push('ellipsis character');
  if (/ /.test(text)) issues.push('non-breaking space');
  return issues;
}

/**
 * Escape a value for insertion into HTML text or an attribute.
 */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * House-style text bound for the HTML snippet: normalized, then escaped.
 */
export function htmlText(value) {
  return escapeHtml(clean(value));
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Normalize a date to the FGDC compact form YYYYMMDD. Accepts YYYY-MM-DD,
 * YYYYMMDD, YYYYMM, YYYY, and the ISO timestamps ArcGIS writes.
 * Returns '' when the value cannot be read as a date.
 */
export function toFgdcDate(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^(unknown|present|n\/?a)$/i.test(raw)) return raw.toLowerCase() === 'present' ? 'Present' : 'Unknown';
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(raw);
  if (iso) return `${iso[1]}${iso[2]}${iso[3] || ''}`;
  const compact = /^(\d{4})(\d{2})?(\d{2})?$/.exec(raw.replace(/\s/g, ''));
  if (compact) return `${compact[1]}${compact[2] || ''}${compact[3] || ''}`;
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slashed) {
    return `${slashed[3]}${String(slashed[1]).padStart(2, '0')}${String(slashed[2]).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, '0')}${String(parsed.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
}

/**
 * Render a date as "Month D, YYYY" for the HTML footer. Falls back to the
 * input when it is not a recognizable date.
 */
export function toDisplayDate(value) {
  const compact = toFgdcDate(value);
  const match = /^(\d{4})(\d{2})?(\d{2})?$/.exec(compact);
  if (!match) return cleanLine(value);
  const year = match[1];
  if (!match[2]) return year;
  const month = MONTHS[Number(match[2]) - 1] || '';
  if (!match[3]) return `${month} ${year}`.trim();
  return `${month} ${Number(match[3])}, ${year}`;
}

/**
 * YYYY-MM-DD for date inputs.
 */
export function toInputDate(value) {
  const compact = toFgdcDate(value);
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(compact);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

/**
 * Today in YYYYMMDD, local time.
 */
export function todayFgdc(now = new Date()) {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Split a block of prose into paragraphs on blank lines.
 */
export function paragraphs(value) {
  return clean(value)
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Split a comma, semicolon or newline delimited list into unique trimmed items.
 */
export function splitList(value) {
  const seen = new Set();
  const items = [];
  for (const part of clean(value).split(/[,;\n]+/)) {
    const item = part.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

/**
 * Format a number with thousands separators for display text.
 */
export function formatCount(value) {
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(number)) return cleanLine(value);
  return number.toLocaleString('en-US');
}

/**
 * Turn a geodatabase field name into a readable alias: FIELD_NAME -> Field Name.
 */
export function humanizeFieldName(name) {
  const raw = cleanLine(name);
  if (!raw) return '';
  const spaced = raw
    .replace(/[_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced
    .split(' ')
    .map((word) => (word === word.toUpperCase() && word.length <= 4
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * Stable slug for filenames.
 */
export function slugify(value) {
  return cleanLine(value)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'metadata';
}
