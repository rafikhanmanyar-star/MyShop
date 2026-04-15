import { useState } from 'react';
import { riderApi } from '../api';
import { useToast } from '../context/ToastContext';
import { useRiderWork } from '../context/RiderWorkContext';

export function NewOrderModal() {
  const { newOrderPopup, dismissNewOrderPopup, refreshProfile, bumpDeliveryFeed } = useRiderWork();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!newOrderPopup) return null;

  const dist =
    newOrderPopup.distanceKm != null ? `${newOrderPopup.distanceKm.toFixed(1)} km` : '—';

  const onAccept = async () => {
    setBusy(true);
    try {
      await riderApi.accept(newOrderPopup.orderId);
      showToast('Order accepted');
      dismissNewOrderPopup();
      await refreshProfile();
      bumpDeliveryFeed();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    setBusy(true);
    try {
      await riderApi.reject(newOrderPopup.orderId);
      showToast('Order declined');
      dismissNewOrderPopup();
      await refreshProfile();
      bumpDeliveryFeed();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Could not decline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-order-title">
      <div className="modal card">
        <h2 id="new-order-title" style={{ margin: '0 0 8px', fontSize: 18 }}>
          New order assigned
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>Order {newOrderPopup.orderNumber}</p>
        <p style={{ margin: '8px 0 16px', fontSize: 16 }}>Distance · {dist}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => void onReject()}>
            Reject
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => void onAccept()}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
