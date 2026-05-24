/** Light tap feedback on supported Android / mobile browsers. */
export function triggerNavHaptic(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
}
