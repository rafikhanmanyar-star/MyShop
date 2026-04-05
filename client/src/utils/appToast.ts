/** Lightweight toast (no extra dependency). Used for save failures and confirmations. */
export function showAppToast(
  message: string,
  variant: 'error' | 'success' | 'info' = 'info',
  durationMs = 4500
): void {
  if (typeof document === 'undefined') return;
  const toast = document.createElement('div');
  toast.className =
    'fixed bottom-4 right-4 z-[10000] max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-xl animate-slide-up';
  if (variant === 'error') {
    toast.classList.add('bg-rose-600', 'text-white');
  } else if (variant === 'success') {
    toast.classList.add('bg-emerald-600', 'text-white');
  } else {
    toast.classList.add('bg-slate-800', 'text-white');
  }
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), durationMs);
}
