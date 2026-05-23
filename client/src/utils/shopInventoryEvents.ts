/** Notify POS, inventory UI, and dashboards that stock levels changed. */
export function notifyShopInventoryChanged(detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('shop:realtime', {
      detail: { type: 'inventory_updated', ...detail },
    })
  );
}
