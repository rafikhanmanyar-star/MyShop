export type ProcurementToastType = 'success' | 'error' | 'info';

export function showProcurementToast(message: string, type: ProcurementToastType = 'success'): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  const tone =
    type === 'success'
      ? 'bg-success text-white'
      : type === 'error'
        ? 'bg-destructive text-white'
        : 'bg-slate-700 text-white dark:bg-slate-600';
  el.className = [
    'fixed bottom-4 right-4 z-[10000] max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-erp-md transition-opacity duration-200',
    tone,
  ].join(' ');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('opacity-0', 'transition-opacity', 'duration-200');
    window.setTimeout(() => el.remove(), 200);
  }, 2800);
}
