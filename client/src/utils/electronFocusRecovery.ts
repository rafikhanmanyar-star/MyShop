/**
 * Mitigates intermittent keyboard loss in Electron when the renderer has no focused field
 * (e.g. after native dialogs, hidden print windows, or clicks on non-focusable regions).
 */

const isElectronFile = () => typeof window !== 'undefined' && window.location.protocol === 'file:';

function isEditableTarget(el: Element | null): boolean {
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

function findFocusableInput(): HTMLElement | null {
  const preferred = document.getElementById('pos-product-search') as HTMLInputElement | null;
  if (preferred && preferred.offsetParent !== null && !preferred.disabled) return preferred;
  const first = document.querySelector(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
  ) as HTMLElement | null;
  return first;
}

export function installElectronFocusRecovery(): () => void {
  if (!isElectronFile()) {
    return () => {};
  }

  const dev = import.meta.env.DEV;

  const onFocusIn = (e: FocusEvent) => {
    if (dev) console.debug('[focus] in', (e.target as Node)?.nodeName, e.target);
  };
  const onFocusOut = (e: FocusEvent) => {
    if (dev) console.debug('[focus] out', (e.target as Node)?.nodeName, e.target);
  };

  const onClick = () => {
    const ae = document.activeElement;
    if (isEditableTarget(ae)) return;
    if (ae && ae !== document.body && ae !== document.documentElement) return;
    const input = findFocusableInput();
    if (input) input.focus({ preventScroll: true });
  };

  const intervalId = window.setInterval(() => {
    if (!document.hasFocus()) return;
    const ae = document.activeElement;
    if (ae !== document.body && ae !== document.documentElement) return;
    if (dev) console.warn('[focus] recover — document had no editable focus');
    findFocusableInput()?.focus({ preventScroll: true });
  }, 2000);

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('click', onClick, true);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('click', onClick, true);
  };
}
