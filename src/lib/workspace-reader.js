// =============================================================================
// STREAMING WORKSPACE READER
// =============================================================================
// Ties the definition parser and the data scanner together over a stream of
// text chunks, so a workspace export exported with data never has to be held in
// memory all at once. Only the definition, which is the small half, is kept.
//
// DOM free, so the same path runs in the browser and under node --test.
// =============================================================================

import { parseWorkspaceDefinition } from './workspace.js';
import { createWorkspaceDataScanner } from './workspace-data.js';

const DEFINITION_END = '</WorkspaceDefinition>';

/**
 * Consume an async iterable of text chunks and return the workspace definition
 * plus per-dataset statistics.
 *
 * `onProgress` is called with a fraction between 0 and 1 when `totalBytes` is
 * known, so a large read can report itself rather than looking frozen.
 */
export async function readWorkspaceDocument(chunks, options = {}) {
  const { onProgress = null, totalBytes = 0 } = options;

  const scanner = createWorkspaceDataScanner();
  let head = '';
  let definitionText = '';
  let bytesSeen = 0;
  let sawData = false;

  for await (const chunk of chunks) {
    bytesSeen += chunk.length;

    // Keep collecting the head until the definition closes, then stop holding
    // text entirely. This is what keeps a 200 MB export from being resident.
    if (!definitionText) {
      head += chunk;
      const end = head.indexOf(DEFINITION_END);
      if (end !== -1) {
        definitionText = head.slice(0, end + DEFINITION_END.length);
        head = '';
      }
    }

    if (!sawData && chunk.includes('<WorkspaceData')) sawData = true;
    scanner.push(chunk);

    if (onProgress && totalBytes) onProgress(Math.min(1, bytesSeen / totalBytes));
  }

  // A schema-only export has no WorkspaceData section and never closes the way
  // above, so fall back to whatever was collected.
  if (!definitionText) definitionText = head;
  head = '';

  if (!definitionText.trim()) throw new Error('The file is empty.');

  // The definition needs to be a parseable document on its own.
  let toParse = definitionText;
  if (!toParse.includes(DEFINITION_END)) {
    // Truncated or schema-only: close any open workspace element so the parser
    // has something well formed to work with.
    toParse = `${toParse}\n${DEFINITION_END}`;
  }
  if (!/<WorkspaceDefinition/i.test(toParse)) {
    throw new Error('No WorkspaceDefinition found. This does not look like an XML Workspace Document.');
  }
  // Trim anything before the definition so the parser sees it as the root.
  const definitionStart = toParse.search(/<WorkspaceDefinition[\s>]/i);
  const rootText = toParse.slice(definitionStart);

  const definition = parseWorkspaceDefinition(rootText);
  const stats = scanner.finish();

  return {
    ...definition,
    stats,
    includesData: sawData && Object.values(stats).some((entry) => entry.recordCount > 0),
    bytesRead: bytesSeen
  };
}

/**
 * Chunk iterator over a browser File or Blob, decoded through one shared
 * TextDecoder so a multi-byte character split across a chunk boundary is not
 * corrupted.
 */
export async function* fileChunks(file, chunkSize = 4 << 20) {
  const decoder = new TextDecoder('utf-8');
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const buffer = await slice.arrayBuffer();
    const text = decoder.decode(new Uint8Array(buffer), { stream: true });
    if (text) yield text;
    // Give the browser a chance to paint the progress indicator.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

/**
 * Chunk iterator over a string, for tests and small in-memory documents.
 */
export async function* stringChunks(text, chunkSize = 1 << 20) {
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    yield text.slice(offset, offset + chunkSize);
  }
}
