/**
 * True when running the packaged desktop POS (Electron): file:// or preload API present.
 * Browser-based shop admin / dashboard should remain false so terminal caps do not apply there.
 */
export function isPosDesktopClient(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return true;
  return Boolean((window as unknown as { electronAPI?: unknown }).electronAPI);
}
