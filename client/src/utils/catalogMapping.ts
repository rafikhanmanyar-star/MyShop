import { perfMark, perfMeasure } from './perfTrace';

/** Yield the main thread between chunks so UI stays clickable during large-catalog mapping. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else if (typeof setTimeout !== 'undefined') {
      setTimeout(resolve, 0);
    } else {
      resolve();
    }
  });
}

/**
 * Map a large SKU array in chunks without blocking mouse/keyboard for minutes.
 * ~1052 rows × 3 JSON fields = thousands of parses — must not run in one synchronous pass.
 */
export async function mapRowsInChunks<T, R>(
  rows: T[],
  mapper: (row: T) => R,
  chunkSize = 100,
  traceLabel?: string
): Promise<R[]> {
  if (rows.length === 0) return [];
  const label = traceLabel ?? 'map-rows';
  perfMark(`${label}:start`, { count: rows.length, chunkSize });
  const out: R[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, rows.length);
    for (let j = i; j < end; j++) {
      out.push(mapper(rows[j]));
    }
    if (end < rows.length) {
      await yieldToMain();
    }
  }
  perfMeasure(label, `${label}:start`, { mapped: out.length });
  return out;
}

/** Parse JSON object fields that may arrive as string or object from API/IndexedDB. */
export function parseJsonRecord(raw: unknown): Record<string, number> {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Record<string, number> = {};
  for (const k of Object.keys(obj as object)) {
    out[k] = Number((obj as Record<string, unknown>)[k]) || 0;
  }
  return out;
}
