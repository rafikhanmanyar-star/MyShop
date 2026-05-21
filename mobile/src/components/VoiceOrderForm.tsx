import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi, voiceOrderApi } from '../api';
import VoiceRecorder, { type VoiceRecorderResult } from './VoiceRecorder';
import { useOnline } from '../hooks/useOnline';
import { queueVoiceOrder } from '../services/voiceOrderSyncStore';
import { getCurrentGeoPosition } from '../utils/deliveryLocation';

type Props = {
    /** When false, show login prompt instead of form */
    requireLogin?: boolean;
    onSwitchToCart?: () => void;
    compact?: boolean;
};

export default function VoiceOrderForm({ requireLogin = true, onSwitchToCart, compact }: Props) {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const online = useOnline();

    const voiceEnabled = state.settings?.voice_ordering_enabled !== false;
    const maxSeconds = state.settings?.max_voice_recording_seconds ?? 120;

    const [recording, setRecording] = useState<VoiceRecorderResult | null>(null);
    const [notes, setNotes] = useState('');
    const [branchId, setBranchId] = useState('');
    const [branches, setBranches] = useState<any[]>([]);
    const [deliveryMode, setDeliveryMode] = useState<'delivery' | 'pickup'>('delivery');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadPct, setUploadPct] = useState<number | null>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [apiEnabled, setApiEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        if (!state.isLoggedIn) return;
        voiceOrderApi.getSettings().then((s: { enabled?: boolean; maxRecordingSeconds?: number }) => {
            setApiEnabled(!!s.enabled);
            setSettingsLoaded(true);
        }).catch(() => {
            setApiEnabled(voiceEnabled);
            setSettingsLoaded(true);
        });
        customerApi.getBranches().then((b: any) => setBranches(Array.isArray(b) ? b : b?.branches || [])).catch(() => {});
        customerApi.getProfile().then((p: any) => {
            if (p?.address_line1) setAddress(p.address_line1);
        }).catch(() => {});
    }, [state.isLoggedIn, voiceEnabled]);

    const enabled = voiceEnabled && (apiEnabled !== false);

    const goLogin = () => {
        if (compact) {
            try {
                sessionStorage.setItem('myshop_cart_order_mode', 'voice');
            } catch { /* ignore */ }
            navigate(`/${shopSlug}/login?redirect=cart`);
        } else {
            navigate(`/${shopSlug}/login?redirect=voice-order`);
        }
    };

    const submit = async () => {
        if (!state.isLoggedIn) {
            goLogin();
            return;
        }
        let durationSec = recording?.durationSeconds ?? 0;
        if (recording?.url && durationSec < 2) {
            try {
                const meta = await new Promise<number>((resolve) => {
                    const a = new Audio();
                    a.preload = 'metadata';
                    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
                    a.onerror = () => resolve(0);
                    a.src = recording!.url;
                });
                if (meta >= 2) durationSec = meta;
            } catch { /* keep durationSec */ }
        }
        if (!recording || durationSec < 2) {
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
                        audioDurationSeconds: durationSec,
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
                audioDurationSeconds: durationSec,
            });
            const orderId = created.id;
            setUploadPct(40);
            const ext = recording.mimeType.includes('mp4') ? 'm4a' : 'webm';
            const file = new File([recording.blob], `voice.${ext}`, { type: recording.mimeType });
            await voiceOrderApi.uploadAudio(orderId, file, durationSec, (p) => setUploadPct(40 + p * 0.6));
            showToast('Voice order sent!');
            navigate(`/${shopSlug}/voice-orders/${orderId}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to send';
            showToast(msg);
        } finally {
            setLoading(false);
            setUploadPct(null);
        }
    };

    if (requireLogin && !state.isLoggedIn) {
        return (
            <div style={{ padding: compact ? '12px 0' : '16px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Sign in to send a voice order
                </p>
                <button type="button" className="btn btn-primary btn-full" onClick={goLogin}>
                    Login to record &amp; send
                </button>
            </div>
        );
    }

    if (state.isLoggedIn && settingsLoaded && !enabled) {
        return (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', padding: 12 }}>
                Voice ordering is not enabled for this shop yet. Ask the store to turn it on in POS Settings → Voice orders.
            </p>
        );
    }

    return (
        <div style={{ paddingBottom: compact ? 8 : 24 }}>
            {!compact && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
                    Speak your list naturally — e.g. &quot;2 milk, 1 bread, half kilo sugar&quot;
                </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                    type="button"
                    className={`btn ${deliveryMode === 'delivery' ? 'btn-primary' : ''}`}
                    style={{
                        flex: 1,
                        ...(deliveryMode !== 'delivery'
                            ? { background: 'var(--surface-elevated)', color: 'var(--text)', border: '1px solid var(--border-subtle)' }
                            : {}),
                    }}
                    onClick={() => setDeliveryMode('delivery')}
                >
                    Delivery
                </button>
                <button
                    type="button"
                    className={`btn ${deliveryMode === 'pickup' ? 'btn-primary' : ''}`}
                    style={{
                        flex: 1,
                        ...(deliveryMode !== 'pickup'
                            ? { background: 'var(--surface-elevated)', color: 'var(--text)', border: '1px solid var(--border-subtle)' }
                            : {}),
                    }}
                    onClick={() => setDeliveryMode('pickup')}
                >
                    Pickup
                </button>
            </div>

            {state.isLoggedIn && branches.length > 1 && (
                <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Branch</span>
                    <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                        <option value="">Nearest / default</option>
                        {branches.map((b: { id: string; name: string }) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </label>
            )}

            {deliveryMode === 'delivery' && (
                <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Delivery address</span>
                    <textarea
                        className="input"
                        rows={2}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        style={{ width: '100%', marginTop: 4 }}
                        placeholder="Your delivery address"
                    />
                </label>
            )}

            <VoiceRecorder maxSeconds={maxSeconds} onRecordingReady={setRecording} />

            <label style={{ display: 'block', marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Optional text note</span>
                <textarea
                    className="input"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. ring the bell, urgent"
                    style={{ width: '100%', marginTop: 4 }}
                />
            </label>

            {uploadPct != null && (
                <div style={{ marginTop: 12, height: 6, background: '#e2e8f0', borderRadius: 4 }}>
                    <div style={{ width: `${uploadPct}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.2s' }} />
                </div>
            )}

            <button
                type="button"
                className="btn btn-primary btn-full"
                style={{ marginTop: 16, padding: 16, fontSize: 16 }}
                disabled={loading || !recording}
                onClick={() => void submit()}
            >
                {loading ? 'Sending…' : 'Submit voice order'}
            </button>

            {onSwitchToCart && (
                <button
                    type="button"
                    className="btn btn-full"
                    style={{
                        marginTop: 10,
                        padding: 14,
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                    }}
                    onClick={onSwitchToCart}
                >
                    Use cart instead
                </button>
            )}
        </div>
    );
}
