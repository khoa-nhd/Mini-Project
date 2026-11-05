import crypto from 'crypto';
import type { ExtractResult } from './gemini.js';

interface CacheEntry {
  result: ExtractResult;
  created: number;
}

// Process-local memo of Gemini extraction results, keyed by the chunk content
// plus every input that changes the output (answer key, user prompt, model,
// attached image). Re-uploads of the same document are common: without this,
// each retry pays a fresh 5-90s billed Gemini round-trip. TTL keeps the map
// bounded as a simple FIFO, which is plenty for a single-container deployment.
const FPS_TTL_MS = 3 * 60 * 60 * 1000; // 3 h
const MAX_ENTRIES = 200;

const store = new Map<string, CacheEntry>();

export function makeExtractKey(
  chunkText: string,
  answerKey?: string,
  userPrompt?: string,
  model?: string,
  imageBuffer?: Buffer,
  imageMimeType?: string
): string {
  const hash = crypto.createHash('sha256');
  hash.update('chunk\u0000').update(chunkText);
  hash.update('\u0000answer\u0000').update(answerKey ?? '');
  hash.update('\u0000prompt\u0000').update(userPrompt ?? '');
  hash.update('\u0000model\u0000').update(model ?? '');
  if (imageBuffer) {
    hash
      .update('\u0000image\u0000')
      .update(imageMimeType ?? '')
      .update(crypto.createHash('sha256').update(imageBuffer).digest());
  }
  return hash.digest('hex');
}

/** Returns the cached ExtractResult for `key`, or fills the cache via `loader`. */
export async function cachedExtract(
  key: string,
  loader: () => Promise<ExtractResult>
): Promise<ExtractResult> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.created < FPS_TTL_MS) {
    // Refresh the entry (LRU-ish: most recently re-requested chunks are kept).
    store.delete(key);
    store.set(key, hit);
    return hit.result;
  }
  const result = await loader();
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value as string | undefined;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { result, created: Date.now() });
  return result;
}

export function clearExtractCache(): void {
  store.clear();
}

/** Test hook: number of live entries. */
export function extractCacheSize(): number {
  return store.size;
}
