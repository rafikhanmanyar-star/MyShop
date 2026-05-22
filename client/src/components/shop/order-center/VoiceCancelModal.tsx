import React, { useState } from 'react';
import { X } from 'lucide-react';
import { VOICE_CANCEL_REASONS } from '../../../types/orderCenter';

interface Props {
    open: boolean;
    onClose: () => void;
    onConfirm: (data: { reason: string; note?: string; notifyCustomer: boolean }) => Promise<void>;
    loading?: boolean;
}

export function VoiceCancelModal({ open, onClose, onConfirm, loading }: Props) {
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [notifyCustomer, setNotifyCustomer] = useState(true);

    if (!open) return null;

    const submit = async () => {
        if (!reason) return;
        await onConfirm({ reason, note: note.trim() || undefined, notifyCustomer });
        setReason('');
        setNote('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Cancel voice order</h3>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X size={20} />
                    </button>
                </div>
                <label className="block text-sm font-medium mb-2">Reason *</label>
                <select
                    className="input w-full mb-3"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                >
                    <option value="">Select reason…</option>
                    {VOICE_CANCEL_REASONS.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.label}
                        </option>
                    ))}
                </select>
                <label className="block text-sm font-medium mb-2">Note (optional)</label>
                <textarea
                    className="input w-full mb-3 min-h-[80px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Internal note for activity log…"
                />
                <label className="flex items-center gap-2 text-sm mb-4">
                    <input
                        type="checkbox"
                        checked={notifyCustomer}
                        onChange={(e) => setNotifyCustomer(e.target.checked)}
                    />
                    Notify customer (push when available)
                </label>
                <div className="flex gap-2 justify-end">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                        Back
                    </button>
                    <button
                        type="button"
                        className="btn bg-red-600 text-white hover:bg-red-700"
                        disabled={!reason || loading}
                        onClick={() => void submit()}
                    >
                        {loading ? 'Cancelling…' : 'Cancel order'}
                    </button>
                </div>
            </div>
        </div>
    );
}
