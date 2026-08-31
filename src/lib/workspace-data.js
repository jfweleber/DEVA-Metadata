// =============================================================================
// XML WORKSPACE DATA SCANNER
// =============================================================================
// An XML Workspace Document exported with data can be very large: the schema is
// a few kilobytes, the features are hundreds of megabytes. The definition is
// parsed into a tree, but the data half never is. It is streamed through this
// scanner in chunks, which keeps only counters and small aggregates.
//
// What it produces is worth the trouble:
//
//   - the true feature count, rather than a number typed from memory
//   - observed minimum and maximum for numeric fields, which is exactly what an
//     FGDC range domain wants
//   - the distinct values of a text field, which is exactly what an enumerated
//     domain wants, when there are few enough to enumerate
//
// These are measurements of the data, not assumptions about it, so they can be
// filled in without breaking the rule against inventing an attribute table.
// =============================================================================

// Geometry values are the bulk of the file and hold nothing worth aggregating.
const GEOMETRY_TYPES = /^(esri:)?(Polygon|Polyline|Point|Multipoint|Multipatch|Envelope)N?$/i;

// Caps that keep memory flat no matter how large the export is.
const MAX_DISTINCT = 25;
const MAX_VALUE_LENGTH = 400;

function newFieldStats() {
  return {
    count: 0,
    nulls: 0,
    min: null,
    max: null,
    distinct: new Set(),
    truncated: false,
    dateMin: '',
    dateMax: ''
  };
}

/**
 * Fold one value into a field's running aggregate.
 */
function observe(stats, rawValue, xsiTypeName) {
  stats.count += 1;
  const value = rawValue == null ? '' : String(rawValue).trim();
  if (!value) {
    stats.nulls += 1;
    return;
  }

  if (/date|time/i.test(xsiTypeName)) {
    if (!stats.dateMin || value < stats.dateMin) stats.dateMin = value;
    if (!stats.dateMax || value > stats.dateMax) stats.dateMax = value;
    return;
  }

  const numeric = Number(value);
  if (/int|double|decimal|float|short|long/i.test(xsiTypeName) && Number.isFinite(numeric)) {
    if (stats.min === null || numeric < stats.min) stats.min = numeric;
    if (stats.max === null || numeric > stats.max) stats.max = numeric;
    return;
  }

  if (Number.isFinite(numeric) && value !== '' && !/string|char/i.test(xsiTypeName)) {
    if (stats.min === null || numeric < stats.min) stats.min = numeric;
    if (stats.max === null || numeric > stats.max) stats.max = numeric;
    return;
  }

  // Text: collect distinct values until there are too many to enumerate.
  if (!stats.truncated && value.length <= MAX_VALUE_LENGTH) {
    stats.distinct.add(value);
    if (stats.distinct.size > MAX_DISTINCT) {
      stats.truncated = true;
      stats.distinct.clear();
    }
  } else if (value.length > MAX_VALUE_LENGTH) {
    stats.truncated = true;
    stats.distinct.clear();
  }
}

/**
 * Streaming scanner. Feed it chunks of the document in order, then call
 * finish(). Everything before <WorkspaceData is ignored, so the whole file can
 * be streamed through without splitting it first.
 */
export function createWorkspaceDataScanner() {
  const datasets = new Map();

  // The buffer is consumed with a moving cursor rather than by re-slicing it.
  // Slicing a multi-megabyte string once per record turns the scan quadratic:
  // with 8 MB chunks that took minutes, with a cursor it is linear and the
  // chunk size stops mattering.
  let buffer = '';
  let cursor = 0;
  let state = 'seeking-data';
  let current = null;
  let fieldNames = null;

  const ensureDataset = (name) => {
    if (!datasets.has(name)) datasets.set(name, { recordCount: 0, fields: {} });
    return datasets.get(name);
  };

  const readRecord = (body) => {
    const dataset = ensureDataset(current || '(unnamed)');
    dataset.recordCount += 1;
    if (!fieldNames || !fieldNames.length) return;

    // Values appear in the field order the RecordSet declared. Geometry values
    // are the bulk of the bytes and hold nothing to aggregate, so they are
    // counted past rather than read.
    let index = 0;
    const pattern = /<Value\b([^>]*)>([\s\S]*?)<\/Value>/g;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const attributes = match[1] || '';
      const typeMatch = /type\s*=\s*"([^"]+)"/i.exec(attributes);
      const typeName = (typeMatch ? typeMatch[1] : '').replace(/^\w+:/, '');
      const fieldName = fieldNames[index];
      index += 1;
      if (!fieldName) continue;
      if (GEOMETRY_TYPES.test(typeName)) continue;

      const stats = dataset.fields[fieldName] || (dataset.fields[fieldName] = newFieldStats());
      if (/nil\s*=\s*"true"/i.test(attributes)) {
        stats.count += 1;
        stats.nulls += 1;
        continue;
      }
      observe(stats, match[2], typeName);
    }
  };

  /**
   * Consume whatever complete structures sit between the cursor and the end of
   * the buffer. Returns when it needs more input.
   */
  const drain = () => {
    for (;;) {
      if (state === 'seeking-data') {
        const start = buffer.indexOf('<WorkspaceData', cursor);
        if (start === -1) {
          // Keep a short tail in case the marker straddles a chunk boundary.
          cursor = Math.max(cursor, buffer.length - 32);
          return;
        }
        cursor = start + '<WorkspaceData'.length;
        state = 'seeking-dataset';
        continue;
      }

      if (state === 'seeking-dataset') {
        const open = buffer.indexOf('<DatasetName>', cursor);
        if (open === -1) {
          cursor = Math.max(cursor, buffer.length - 32);
          return;
        }
        const close = buffer.indexOf('</DatasetName>', open);
        if (close === -1) {
          cursor = open;
          return;
        }
        current = buffer.slice(open + '<DatasetName>'.length, close).trim();
        ensureDataset(current);
        fieldNames = null;
        cursor = close + '</DatasetName>'.length;
        state = 'seeking-fields';
        continue;
      }

      if (state === 'seeking-fields') {
        // The RecordSet declares the field order its records follow.
        const fieldsEnd = buffer.indexOf('</Fields>', cursor);
        if (fieldsEnd === -1) return;
        const block = buffer.slice(cursor, fieldsEnd);
        fieldNames = [...block.matchAll(/<Name>([^<]*)<\/Name>/g)].map((match) => match[1].trim());
        cursor = fieldsEnd + '</Fields>'.length;
        state = 'records';
        continue;
      }

      // state === 'records'
      const recordStart = buffer.indexOf('<Record', cursor);

      if (recordStart === -1) {
        // No record ahead: the only thing that can follow is the next dataset.
        if (buffer.indexOf('<DatasetName>', cursor) !== -1) {
          state = 'seeking-dataset';
          continue;
        }
        cursor = Math.max(cursor, buffer.length - 32);
        return;
      }

      // A dataset boundary can only matter if it comes before the next record,
      // so only that span is searched. Scanning the whole remaining buffer here
      // is what made large chunks quadratic: it repeated a full-buffer search
      // once per record.
      if (buffer.slice(cursor, recordStart).includes('<DatasetName>')) {
        state = 'seeking-dataset';
        continue;
      }
      const recordEnd = buffer.indexOf('</Record>', recordStart);
      if (recordEnd === -1) {
        // Wait for the rest of this record.
        cursor = recordStart;
        return;
      }

      readRecord(buffer.slice(recordStart, recordEnd));
      cursor = recordEnd + '</Record>'.length;
    }
  };

  return {
    /**
     * Feed the next chunk of document text, in order.
     */
    push(chunk) {
      buffer += chunk;
      drain();
      // Compact once per chunk, so the buffer never grows without bound and the
      // cost stays proportional to the chunk rather than the document.
      if (cursor > 0) {
        buffer = buffer.slice(cursor);
        cursor = 0;
      }
    },

    /**
     * Finish and return per-dataset statistics, with the value sets turned into
     * sorted arrays.
     */
    finish() {
      drain();
      const result = {};
      for (const [name, dataset] of datasets) {
        const fields = {};
        for (const [fieldName, stats] of Object.entries(dataset.fields)) {
          fields[fieldName] = {
            count: stats.count,
            nulls: stats.nulls,
            min: stats.min,
            max: stats.max,
            dateMin: stats.dateMin,
            dateMax: stats.dateMax,
            truncated: stats.truncated,
            distinct: stats.truncated ? [] : [...stats.distinct].sort()
          };
        }
        result[name] = { recordCount: dataset.recordCount, fields };
      }
      return result;
    }
  };
}

/**
 * Convenience wrapper for a whole document already in memory.
 */
export function scanWorkspaceData(text, chunkSize = 1 << 20) {
  const scanner = createWorkspaceDataScanner();
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    scanner.push(text.slice(offset, offset + chunkSize));
  }
  return scanner.finish();
}
