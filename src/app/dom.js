// =============================================================================
// DOM HELPERS
// =============================================================================
// Small helpers instead of a framework. The wizard renders a panel once when
// the user opens a step, then mutates project state on input without
// re-rendering, so that typing never steals focus from the field being typed in.
// =============================================================================

/**
 * Create an element. Props map to attributes, except `class`, `text`, `html`,
 * `on` (event map) and `dataset`.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) node.dataset[dataKey] = dataValue;
    } else if (key === 'value') {
      node.value = value;
    } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
      node[key] = Boolean(value);
    } else {
      node.setAttribute(key, value);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Replace a node's children, dropping null and false entries. `replaceChildren`
 * stringifies them, which is how a literal "null" ends up on the page.
 */
export function setChildren(node, children) {
  const list = (Array.isArray(children) ? children : [children])
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child) => (child instanceof Node ? child : document.createTextNode(String(child))));
  node.replaceChildren(...list);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

/**
 * Brief confirmation message, used for copy and save actions.
 */
let toastTimer = null;
export function toast(message) {
  const node = qs('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('show'), 2200);
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea for browsers
 * that block the async clipboard API on non-secure origins.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const scratch = el('textarea', { value: text, style: 'position:fixed;top:-1000px;opacity:0;' });
  document.body.append(scratch);
  scratch.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  scratch.remove();
  return ok;
}

/**
 * Trigger a file download from a string.
 */
export function downloadText(filename, text, mime = 'application/xml') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
