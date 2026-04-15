import { useState } from 'react';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';
import { useToast } from '../context/ToastContext';
import { useRiderWork } from '../context/RiderWorkContext';

export function NewOrderModal() {
  const { shopSlug } = useRider();
  const { newOrderPopup, dismissNewOrderPopup, refreshProfile, bumpDeliveryFeed } = useRiderWork();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!newOrderPopup) return null;

  const dist = newOrderPopup.distanceKm != null ? `${newOrderPopup.distanceKm.toFixed(1)} KM` : '—';

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
    <div className="modal-backdrop modal-backdrop--obo" role="dialog" aria-modal="true" aria-labelledby="new-order-title">
      <div className="modal-urgent">
        <div className="modal-urgent__header">
          <span className="modal-urgent__warn-ico" aria-hidden />
          <span className="modal-urgent__header-title">URGENT REQUEST</span>
          <span className="modal-urgent__timer">
            <span className="modal-urgent__clock" aria-hidden /> NEW
          </span>
        </div>

        <p className="modal-urgent__id-label">ORDER IDENTIFIER</p>
        <h2 id="new-order-title" className="modal-urgent__id">
          #{newOrderPopup.orderNumber}
        </h2>

        <div className="modal-urgent__metrics">
          <div className="modal-urgent__metric">
            <span className="modal-urgent__metric-label">DISTANCE</span>
            <span className="modal-urgent__metric-val">{dist}</span>
          </div>
          <div className="modal-urgent__metric">
            <span className="modal-urgent__metric-label">EARNINGS</span>
            <span className="modal-urgent__metric-val modal-urgent__metric-val--money">PKR —</span>
          </div>
        </div>

        <div className="modal-urgent__route">
          <div className="modal-urgent__route-line" aria-hidden />
          <div className="modal-urgent__stop">
            <span className="modal-urgent__dot modal-urgent__dot--pick" />
            <div>
              <div className="modal-urgent__stop-label">PICKUP</div>
              <div className="modal-urgent__stop-title">Shop ({shopSlug || 'store'})</div>
              <div className="modal-urgent__stop-addr">Prepare order at branch / counter</div>
            </div>
          </div>
          <div className="modal-urgent__stop">
            <span className="modal-urgent__dot modal-urgent__dot--drop" />
            <div>
              <div className="modal-urgent__stop-label">DROPOFF</div>
              <div className="modal-urgent__stop-title">Customer address</div>
              <div className="modal-urgent__stop-addr">Open order after accept for full route and map</div>
            </div>
          </div>
        </div>

        <div className="modal-urgent__tags">
          <span className="modal-urgent__tag">PRIORITY</span>
        </div>

        <div className="modal-urgent__actions">
          <button type="button" className="modal-urgent__accept" disabled={busy} onClick={() => void onAccept()}>
            <span className="modal-urgent__check" aria-hidden /> ACCEPT ORDER
          </button>
          <button type="button" className="modal-urgent__reject" disabled={busy} onClick={() => void onReject()}>
            REJECT REQUEST
          </button>
        </div>
      </div>
    </div>
  );
}
