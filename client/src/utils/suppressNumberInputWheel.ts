/**
 * Disables the browser default where wheel/trackpad scroll over a focused
 * <input type="number"> changes the value. Install once at app startup.
 */
export function installSuppressNumberInputWheel(): () => void {
  const handler = (e: WheelEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
    if (document.activeElement !== t) return;
    e.preventDefault();
  };
  document.addEventListener('wheel', handler, { capture: true, passive: false });
  return () => document.removeEventListener('wheel', handler, { capture: true });
}
