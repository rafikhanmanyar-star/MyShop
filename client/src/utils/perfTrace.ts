/**
 * Performance + temporary debug tracing for POS catalog/sync issues.
 * Enable in prod: localStorage.setItem('myshop_perf', '1')
 * Verbose debug:   localStorage.setItem('myshop_debug', '1')
 */

type Mark = { at: number; meta?: Record<string, unknown> };

const marks = new Map<string, Mark>();
let debugSessionStart = typeof performance !== 'undefined' ? performance.now() : 0;

function perfEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem('myshop_perf') === '1';
  } catch {
    return false;
  }
}

export function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem('myshop_debug') === '1';
  } catch {
    return false;
  }
}

function tenantDebugMeta(extra?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    tPlusMs: Math.round(performance.now() - debugSessionStart),
  };
  try {
    const tid = localStorage.getItem('tenant_id');
    if (tid) base.tenantId = tid;
  } catch {
    /* ignore */
  }
  return extra ? { ...base, ...extra } : base;
}

/** Temporary diagnostic log — enable with myshop_debug=1 */
export function debugTrace(label: string, meta?: Record<string, unknown>): void {
  if (!debugEnabled()) return;
  const suffix = meta ? ` ${JSON.stringify(tenantDebugMeta(meta))}` : ` ${JSON.stringify(tenantDebugMeta())}`;
  console.log(`[debug] ${label}${suffix}`);
}

export function perfMark(label: string, meta?: Record<string, unknown>): void {
  if (!perfEnabled() && !debugEnabled()) return;
  marks.set(label, { at: performance.now(), meta });
  const suffix = meta ? ` ${JSON.stringify(tenantDebugMeta(meta))}` : '';
  if (debugEnabled()) console.log(`[perf] ▶ ${label}${suffix}`);
  else if (perfEnabled()) console.log(`[perf] ▶ ${label}${suffix}`);
}

export function perfMeasure(label: string, startLabel: string, meta?: Record<string, unknown>): number {
  const start = marks.get(startLabel);
  const ms = start ? Math.round(performance.now() - start.at) : -1;
  const enriched = tenantDebugMeta(meta);
  if (!perfEnabled() && !debugEnabled() && ms < 2000) return ms;
  const suffix = meta || debugEnabled() ? ` ${JSON.stringify(enriched)}` : '';
  const line = `[perf] ◼ ${label}: ${ms}ms (from ${startLabel})${suffix}`;
  if (ms >= 2000 || debugEnabled()) console.warn(line);
  else if (perfEnabled()) console.log(line);
  return ms;
}

export function perfWarn(label: string, ms: number, thresholdMs: number, meta?: Record<string, unknown>): void {
  if (ms < thresholdMs && !perfEnabled() && !debugEnabled()) return;
  if (ms >= thresholdMs || debugEnabled()) {
    console.warn(`[perf] ⚠ SLOW ${label}: ${ms}ms (>${thresholdMs}ms)`, tenantDebugMeta(meta));
  }
}

/** Install long-task observer once (debug mode). */
export function installDebugObservers(): void {
  if (!debugEnabled() || typeof PerformanceObserver === 'undefined') return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 50) {
          debugTrace('long-task', { ms: Math.round(entry.duration), name: entry.name });
        }
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    debugTrace('observers:installed');
  } catch {
    /* longtask not supported */
  }
}
