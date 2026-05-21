import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi, voiceOrderApi } from '../api';
import VoiceRecorder, { type VoiceRecorderResult } from '../components/VoiceRecorder';
import { useOnline } from '../hooks/useOnline';
import { queueVoiceOrder } from '../services/voiceOrderSyncStore';
import { getCurrentGeoPosition } from '../utils/deliveryLocation';

export default function VoiceOrderPlace() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const online = useOnline();

    const [enabled, setEnabled] = useState(false);
    const [maxSeconds, setMaxSeconds] = useState(120);
    const [recording, setRecording] = useState<VoiceRecorderResult | null>(null);
    const [notes, setNotes] = useState('');
    const [branchId, setBranchId] = useState('');
    const [branches, setBranches] = useState<any[]>([]);
    const [deliveryMode, setDeliveryMode] = useState<'delivery' | 'pickup'>('delivery');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadPct, setUploadPct] = useState<number | null>(null);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=voice-order`, { replace: true });
            return;
        }
        voiceOrderApi.getSettings().then((s: any) => {
            setEnabled(!!s.enabled);
            setMaxSeconds(s.maxRecordingSeconds || 120);
        }).catch(() => setEnabled(false));
        customerApi.getBranches().then((b: any) => setBranches(Array.isArray(b) ? b : b?.branches || [])).catch(() => {});
        customerApi.getProfile().then((p: any) => {
            if (p?.address_line1) setAddress(p.address_line1);
        }).catch(() => {});
    }, [state.isLoggedIn, shopSlug, navigate]);

    const submit = async () => {
        if (!recording || recording.durationSeconds < 2) {
            showToast('Record at least 2 seconds');
            return;
        }
        setLoading(true);
        setUploadPct(0);
        try {
            if (!online) {
                await queueVoiceOrder({
                    shopSlug: shopSlug!,
                    meta: {
                        branchId: branchId || undefined,
                        notes: notes || undefined,
                        deliveryMode,
                        deliveryAddress: deliveryMode === 'delivery' ? address : undefined,
                        audioDurationSeconds: recording.durationSeconds,
                    },
                    audioBlob: recording.blob,
                    audioMime: recording.mimeType,
                });
                showToast('Saved offline — will send when online');
                navigate(`/${shopSlug}/voice-orders`);
                return;
            }
            let deliveryLat: number | undefined;
            let deliveryLng: number | undefined;
            if (deliveryMode === 'delivery') {
                try {
                    const geo = await getCurrentGeoPosition();
                    if (geo) {
                        deliveryLat = geo.latitude;
                        deliveryLng = geo.longitude;
                    }
                } catch { /* optional */ }
            }
            const created = await voiceOrderApi.create({
                branchId: branchId || undefined,
                notes: notes || undefined,
                deliveryMode,
                deliveryAddress: deliveryMode === 'delivery' ? address : undefined,
                deliveryLat,
                deliveryLng,
                audioDurationSeconds: recording.durationSeconds,
            });
            const orderId = created.id;
            setUploadPct(40);
            const ext = recording.mimeType.includes('mp4') ? 'm4a' : 'webm';
            const file = new File([recording.blob], `voice.${ext}`, { type: recording.mimeType });
            await voiceOrderApi.uploadAudio(orderId, file, recording.durationSeconds, (p) => setUploadPct(40 + p * 0.6));
            showToast('Voice order sent!');
            navigate(`/${shopSlug}/voice-orders/${orderId}`);
        } catch (e: any) {
            showToast(e.message || 'Failed to send');
        } finally {
            setLoading(false);
            setUploadPct(null);
        }
    };

    if (!enabled) {
        return (
            <div className="page fade-in">
                <h1>Voice Order</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Voice ordering is not enabled for this shop.</p>
            </div>
        );
    }

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            <div className="page-header">
                <h1>Place Voice Order</h1>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Speak your list naturally — like a WhatsApp voice message.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button type="button" className={`btn ${deliveryMode === 'delivery' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setDeliveryMode('delivery')}>Delivery</button>
                <button type="button" className={`btn ${deliveryMode === 'pickup' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setDeliveryMode('pickup')}>Pickup</button>
            </div>

            {branches.length > 1 && (
                <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Branch</span>
                    <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                        <option value="">Nearest / default</option>
                        {branches.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </label>
            )}

            {deliveryMode === 'delivery' && (
                <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Delivery address</span>
                    <textarea className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
                </label>
            )}

            <VoiceRecorder maxSeconds={maxSeconds} onRecordingReady={setRecording} />

            <label style={{ display: 'block', marginTop: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Optional note</span>
                <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ring the bell" style={{ width: '100%', marginTop: 4 }} />
            </label>

            {uploadPct != null && (
                <div style={{ marginTop: 12, height: 6, background: '#e2e8f0', borderRadius: 4 }}>
                    <div style={{ width: `${uploadPct}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.2s' }} />
                </div>
            )}

            <button type="button" className="btn btn-primary btn-full" style={{ marginTop: 20, padding: 16 }} disabled={loading || !recording} onClick={() => void submit()}>
                {loading ? 'Sending…' : 'Submit voice order'}
            </button>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => navigate(`/${shopSlug}/cart`)}>Cart order instead</button>
            </div>
        </div>
    );
}
