import { useState } from 'react';
import type { FailedDeliveryPayload } from '../../api';

const REASONS = [
  'Customer unreachable',
  'Wrong address',
  'Refused order',
  'Payment issue',
  'Store issue',
] as const;

type Props = {
  onClose: () => void;
  onConfirm: (payload: FailedDeliveryPayload) => void;
  busy: boolean;
};

export function FailedDeliverySheet({ onClose, onConfirm, busy }: Props) {
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [proofData, setProofData] = useState('');

  return (
    <div className="r-sheet-overlay" role="dialog" aria-modal="true">
      <div className="r-sheet">
        <h2>Failed delivery</h2>
        <div className="r-field">
          <label>Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 16 }}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="r-field">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 12, borderRadius: 12, fontSize: 15 }}
            placeholder="What happened?"
          />
        </div>
        <div className="r-field">
          <label>Photo proof (optional)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setProofData(String(r.result || '').slice(0, 50000));
              r.readAsDataURL(f);
            }}
          />
        </div>
        <button
          type="button"
          className="r-btn r-btn--danger"
          disabled={busy}
          onClick={() => onConfirm({ reason, notes: notes.trim() || undefined, proofData: proofData || undefined })}
        >
          {busy ? 'Submitting…' : 'Mark failed'}
        </button>
        <button type="button" className="r-btn r-btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
