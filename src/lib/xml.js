// =============================================================================
// XML PARSER / WRITER
// =============================================================================
// A dependency-free XML reader and writer that behaves identically in the
// browser and in Node. The browser has DOMParser, but Node does not, so the
// same hand-rolled parser is used in both places. That keeps the import logic
// testable from the command line instead of only inside a browser tab.
//
// The parser targets the XML that ArcGIS Pro and ISO/FGDC editors actually
// emit: well-formed, no external DTD subsets, occasional CDATA and comments.
// =============================================================================

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

/**
 * Expand XML character and named entities in a text run.
 */
export function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9._-]*);/g, (match, body) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

/**
 * Escape text destined for an XML text node or attribute value.
 */
export function escapeXml(value, forAttribute = false) {
  let out = String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (forAttribute) out = out.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  return out;
}

function makeElement(rawName) {
  const colon = rawName.indexOf(':');
  return {
    type: 'element',
    name: rawName,
    prefix: colon === -1 ? '' : rawName.slice(0, colon),
    local: colon === -1 ? rawName : rawName.slice(colon + 1),
    attrs: {},
    children: []
  };
}

/**
 * Parse an XML document string into a lightweight node tree.
 * Returns the root element, or throws on malformed input.
 */
export function parseXml(source) {
  const text = String(source).replace(/^﻿/, '');
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0;

  const pushText = (raw) => {
    if (!raw) return;
    const parent = stack[stack.length - 1];
    parent.children.push({ type: 'text', value: decodeEntities(raw) });
  };

  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      pushText(text.slice(i));
      break;
    }
    if (lt > i) pushText(text.slice(i, lt));

    // Comments, CDATA, declarations and processing instructions.
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('Unterminated XML comment');
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('Unterminated CDATA section');
      const parent = stack[stack.length - 1];
      parent.children.push({ type: 'text', value: text.slice(lt + 9, end) });
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('Unterminated processing instruction');
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!', lt)) {
      // DOCTYPE or similar. Skip past any internal subset before the closing >.
      let depth = 0;
      let j = lt + 2;
      while (j < text.length) {
        const ch = text[j];
        if (ch === '[') depth += 1;
        else if (ch === ']') depth -= 1;
        else if (ch === '>' && depth <= 0) break;
        j += 1;
      }
      if (j >= text.length) throw new Error('Unterminated XML declaration');
      i = j + 1;
      continue;
    }

    // Closing tag.
    if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      if (end === -1) throw new Error('Unterminated closing tag');
      const name = text.slice(lt + 2, end).trim();
      // Unwind to the matching open element. Tolerate stray closers rather
      // than failing an import over one bad tag.
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].name === name) {
          stack.length = s;
          break;
        }
      }
      i = end + 1;
      continue;
    }

    // Opening tag: scan to the matching '>' while respecting quoted values.
    let j = lt + 1;
    let quote = '';
    while (j < text.length) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    if (j >= text.length) throw new Error('Unterminated opening tag');

    let inner = text.slice(lt + 1, j);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);

    const nameMatch = /^([^\s/>]+)/.exec(inner);
    if (!nameMatch) throw new Error('Malformed element name');
    const element = makeElement(nameMatch[1]);

    const attrPattern = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let attrMatch;
    const attrSource = inner.slice(nameMatch[1].length);
    while ((attrMatch = attrPattern.exec(attrSource)) !== null) {
      const value = attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4];
      element.attrs[attrMatch[1]] = decodeEntities(value);
    }

    stack[stack.length - 1].children.push(element);
    if (!selfClosing) stack.push(element);
    i = j + 1;
  }

  const rootElement = root.children.find((node) => node.type === 'element');
  if (!rootElement) throw new Error('No root element found in XML');
  return rootElement;
}

// -----------------------------------------------------------------------------
// Tree query helpers. All lookups are by local name and case-insensitive so a
// namespaced ISO document and a plain FGDC document can be read the same way.
// -----------------------------------------------------------------------------

export function elementChildren(node) {
  if (!node || !node.children) return [];
  return node.children.filter((child) => child.type === 'element');
}

export function childrenNamed(node, localName) {
  const wanted = String(localName).toLowerCase();
  return elementChildren(node).filter((child) => child.local.toLowerCase() === wanted);
}

export function child(node, localName) {
  return childrenNamed(node, localName)[0] || null;
}

/**
 * Follow a slash-delimited path of local names, returning the first match.
 */
export function pick(node, path) {
  let current = node;
  for (const step of String(path).split('/')) {
    if (!current) return null;
    current = child(current, step);
  }
  return current;
}

/**
 * Follow a slash-delimited path, returning every element matching the final step.
 */
export function pickAll(node, path) {
  const steps = String(path).split('/');
  let level = [node].filter(Boolean);
  for (const step of steps) {
    const next = [];
    for (const candidate of level) next.push(...childrenNamed(candidate, step));
    level = next;
  }
  return level;
}

/**
 * Concatenated text content of a node and its descendants.
 */
export function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return (node.children || []).map(textOf).join('');
}

/**
 * Trimmed text of the element at `path`, or '' when the path is absent.
 */
export function textAt(node, path) {
  const found = pick(node, path);
  return found ? textOf(found).trim().replace(/\s+/g, ' ') : '';
}

/**
 * First non-empty result among several candidate paths.
 */
export function firstTextAt(node, paths) {
  for (const path of paths) {
    const value = textAt(node, path);
    if (value) return value;
  }
  return '';
}

/**
 * Depth-first search for every descendant with the given local name.
 */
export function descendants(node, localName) {
  const wanted = String(localName).toLowerCase();
  const found = [];
  const walk = (current) => {
    for (const element of elementChildren(current)) {
      if (element.local.toLowerCase() === wanted) found.push(element);
      walk(element);
    }
  };
  if (node) walk(node);
  return found;
}

/**
 * First descendant with the given local name, at any depth.
 */
export function firstDescendant(node, localName) {
  return descendants(node, localName)[0] || null;
}

// -----------------------------------------------------------------------------
// Writer
// -----------------------------------------------------------------------------

/**
 * Build indented XML from a nested spec:
 *   ['idinfo', [ ['citation', [ ['title', 'Layer name'] ]] ]]
 * A spec entry is [name, valueOrChildren, attrs?]. Entries whose value is
 * null, undefined or an empty string are dropped so optional FGDC elements do
 * not appear as empty tags.
 */
export function buildElement(spec, indent = 0) {
  if (!Array.isArray(spec)) return '';
  const [name, value, attrs] = spec;
  if (!name) return '';
  const pad = '  '.repeat(indent);
  const attrText = attrs
    ? Object.entries(attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => ` ${k}="${escapeXml(v, true)}"`)
        .join('')
    : '';

  if (Array.isArray(value)) {
    // A single child spec (['cntinfo', [...]]) is accepted as well as a list of
    // them. Without this, passing one spec where a list was expected drops the
    // whole subtree silently, which is a nasty way to lose a required element.
    const childSpecs = typeof value[0] === 'string' ? [value] : value;
    const rendered = childSpecs
      .filter(Boolean)
      .map((childSpec) => buildElement(childSpec, indent + 1))
      .filter(Boolean);
    if (!rendered.length) return '';
    return `${pad}<${name}${attrText}>\n${rendered.join('\n')}\n${pad}</${name}>`;
  }

  if (value === undefined || value === null || value === '') return '';
  const rendered = escapeXml(value);
  if (rendered.includes('\n')) {
    const body = rendered
      .split('\n')
      .map((line) => (line.trim() ? `${pad}  ${line.trim()}` : ''))
      .join('\n');
    return `${pad}<${name}${attrText}>\n${body}\n${pad}</${name}>`;
  }
  return `${pad}<${name}${attrText}>${rendered}</${name}>`;
}

/**
 * Serialize a document spec with an XML declaration.
 */
export function buildDocument(spec) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildElement(spec, 0)}\n`;
}
