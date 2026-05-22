import { useState } from 'react';
import type { DeliveryProofPayload } from '../../api';

type Props = {
  expectedCod: number;
  isCod: boolean;
  onClose: () => void;
  onConfirm: (payload: DeliveryProofPayload) => void;
  busy: boolean;
};

export function DeliveryProofSheet({ expectedCod, isCod, onClose, onConfirm, busy }: Props) {
  const [proofType, setProofType] = useState<'otp' | 'photo' | 'signature'>('otp');
  const [proofData, setProofData] = useState('');
  const [codCollected, setCodCollected] = useState(String(Math.round(expectedCod)));

  const submit = () => {
    if (!proofData.trim() && proofType !== 'photo') {
      return;
    }
    onConfirm({
      proofType,
      proofData: proofData.trim() || undefined,
      codCollected: isCod ? Number(codCollected) : undefined,
    });
  };

  return (
    <div className="r-sheet-overlay" role="dialog" aria-modal="true">
      <div className="r-sheet">
        <h2>Confirm delivery</h2>
        <p style={{ color: 'var(--r-muted)', marginTop: 0 }}>Proof of delivery required</p>

        <div className="r-tabs" style={{ marginTop: 12 }}>
          {(['otp', 'photo', 'signature'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`r-tab ${proofType === t ? 'is-active' : ''}`}
              onClick={() => setProofType(t)}
            >
              {t === 'otp' ? 'OTP' : t === 'photo' ? 'Photo' : 'Signature'}
            </button>
          ))}
        </div>

        {proofType === 'otp' ? (
          <div className="r-field">
            <label>Customer OTP</label>
            <input
              inputMode="numeric"
              placeholder="Enter code from customer"
              value={proofData}
              onChange={(e) => setProofData(e.target.value)}
            />
          </div>
        ) : proofType === 'signature' ? (
          <div className="r-field">
            <label>Customer name (signature)</label>
            <input value={proofData} onChange={(e) => setProofData(e.target.value)} placeholder="Signed by…" />
          </div>
        ) : (
          <div className="r-field">
            <label>Photo note / reference</label>
            <input
              value={proofData}
              onChange={(e) => setProofData(e.target.value)}
              placeholder="Describe photo taken at door"
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ marginTop: 8 }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => setProofData(String(r.result || '').slice(0, 50000));
                r.readAsDataURL(f);
              }}
            />
          </div>
        )}

        {isCod ? (
          <div className="r-field">
            <label>COD collected (PKR)</label>
            <input
              inputMode="decimal"
              value={codCollected}
              onChange={(e) => setCodCollected(e.target.value)}
            />
          </div>
        ) : null}

        <button type="button" className="r-btn r-btn--primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Complete delivery'}
        </button>
        <button type="button" className="r-btn r-btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
