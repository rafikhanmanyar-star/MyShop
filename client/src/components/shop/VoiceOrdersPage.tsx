import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVoiceOrders } from '../../context/VoiceOrdersContext';
import { voiceOrdersApi, VoiceOrder } from '../../services/voiceOrdersApi';
import { getFullImageUrl } from '../../config/apiUrl';
import {
    Mic, RefreshCw, Play, Pause, Volume2, Download, FileText, ShoppingCart,
    Clock, User, Phone, MapPin, Check, X, ChevronRight,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    Pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
    Received: { label: 'Received', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
    Preparing: { label: 'Preparing', color: 'bg-indigo-100 text-indigo-800' },
    InvoiceCreated: { label: 'Invoice created', color: 'bg-violet-100 text-violet-800' },
    Accepted: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-800' },
    OutForDelivery: { label: 'Out for delivery', color: 'bg-teal-100 text-teal-800' },
    Delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800' },
    Rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
    Cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600' },
};

const FILTERS = ['All', 'Pending', 'Received', 'Preparing', 'InvoiceCreated'];

function VoiceAudioPlayer({ src, duration }: { src: string; duration?: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(1);
    const [progress, setProgress] = useState(0);
    const [vol, setVol] = useState(1);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        a.playbackRate = rate;
        a.volume = vol;
    }, [rate, vol]);

    const toggle = () => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) {
            a.pause();
            setPlaying(false);
        } else {
            void a.play();
            setPlaying(true);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50">
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={() => {
                    const a = audioRef.current;
                    if (a && a.duration) setProgress((a.currentTime / a.duration) * 100);
                }}
                onEnded={() => setPlaying(false)}
            />
            <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={toggle} className="p-2 rounded-full bg-primary-600 text-white">
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {duration ? `${Math.round(duration)}s` : ''}
                </span>
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs">
                {[1, 1.5, 2].map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`px-2 py-1 rounded ${rate === r ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}
                        onClick={() => setRate(r)}
                    >
                        {r}x
                    </button>
                ))}
                <Volume2 size={14} className="ml-2" />
                <input type="range" min={0} max={1} step={0.1} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} className="w-20" />
                <a href={src} download className="ml-auto flex items-center gap-1 text-primary-600 hover:underline">
                    <Download size={14} /> Save
                </a>
            </div>
        </div>
    );
}

export function VoiceOrderSettingsPanel({ onBack }: { onBack?: () => void }) {
    const [settings, setSettings] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [apiKey, setApiKey] = useState('');

    useEffect(() => {
        voiceOrdersApi.getSettings().then(setSettings).catch(() => {});
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            const patch: Record<string, unknown> = { ...settings };
            if (apiKey.trim()) patch.transcription_api_key = apiKey.trim();
            const updated = await voiceOrdersApi.updateSettings(patch);
            setSettings(updated);
            setApiKey('');
        } finally {
            setSaving(false);
        }
    };

    if (!settings) return <p className="text-sm text-muted-foreground">Loading voice settings…</p>;

    return (
        <div className="space-y-4 max-w-xl">
            {onBack && (
                <button type="button" onClick={onBack} className="text-sm text-primary-600">← Back</button>
            )}
            <h3 className="text-lg font-bold flex items-center gap-2"><Mic size={20} /> Voice Orders</h3>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!settings.is_enabled} onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })} />
                Enable voice ordering (requires mobile ordering on)
            </label>
            <label className="block text-sm">
                Max recording (seconds)
                <input type="number" className="input mt-1 w-full" min={10} max={300} value={settings.max_recording_seconds}
                    onChange={(e) => setSettings({ ...settings, max_recording_seconds: parseInt(e.target.value, 10) })} />
            </label>
            <label className="block text-sm">
                Max upload (MB)
                <input type="number" className="input mt-1 w-full" min={1} max={50}
                    value={Math.round((settings.max_upload_bytes || 0) / 1048576)}
                    onChange={(e) => setSettings({ ...settings, max_upload_bytes: parseInt(e.target.value, 10) * 1048576 })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!settings.transcription_enabled} onChange={(e) => setSettings({ ...settings, transcription_enabled: e.target.checked })} />
                Enable AI transcription
            </label>
            <label className="block text-sm">
                Transcription provider
                <select className="input mt-1 w-full" value={settings.transcription_provider || 'none'}
                    onChange={(e) => setSettings({ ...settings, transcription_provider: e.target.value })}>
                    <option value="none">None</option>
                    <option value="openai_whisper">OpenAI Whisper</option>
                    <option value="google">Google (coming soon)</option>
                    <option value="azure">Azure (coming soon)</option>
                </select>
            </label>
            <label className="block text-sm">
                API key {settings.transcription_api_key_set ? '(saved — leave blank to keep)' : ''}
                <input type="password" className="input mt-1 w-full" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save voice settings'}
            </button>
        </div>
    );
}

export default function VoiceOrdersPage() {
    const { orders, loading, loadOrders, refreshOrders } = useVoiceOrders();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [filter, setFilter] = useState('Pending');
    const [detail, setDetail] = useState<VoiceOrder | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const selectedId = searchParams.get('order');

    const loadDetail = useCallback(async (id: string) => {
        setDetailLoading(true);
        try {
            setDetail(await voiceOrdersApi.get(id));
        } catch {
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadOrders(filter === 'All' ? undefined : filter);
    }, [filter, loadOrders]);

    useEffect(() => {
        if (selectedId) void loadDetail(selectedId);
        else setDetail(null);
    }, [selectedId, loadDetail]);

    const openOrder = (id: string) => setSearchParams({ order: id });

    const markReceived = async (id: string) => {
        await voiceOrdersApi.updateStatus(id, 'Received');
        refreshOrders();
        if (selectedId === id) void loadDetail(id);
    };

    const createInvoice = (order: VoiceOrder) => {
        sessionStorage.setItem('myshop_pending_voice_order_id', order.id);
        sessionStorage.setItem('myshop_pending_voice_order_notes', order.transcription_text || order.notes || '');
        sessionStorage.setItem('myshop_pending_voice_delivery_mode', order.delivery_mode || 'delivery');
        if (order.customer_phone) {
            sessionStorage.setItem('myshop_pending_voice_order_phone', order.customer_phone);
        }
        navigate('/pos');
    };

    const fmtTime = (d: string) => new Date(d).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <h1 className="text-xl font-bold flex items-center gap-2"><Mic className="text-primary-600" /> Voice Orders</h1>
                <button type="button" onClick={refreshOrders} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                <div className="w-full md:w-[380px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 bg-white dark:bg-slate-900">
                    <div className="flex gap-1 p-2 overflow-x-auto border-b border-slate-100 dark:border-slate-800">
                        {FILTERS.map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                            >
                                {f === 'InvoiceCreated' ? 'Invoiced' : f}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {orders.length === 0 && !loading && (
                            <p className="p-6 text-sm text-center text-muted-foreground">No voice orders in this queue</p>
                        )}
                        {orders.map((o) => {
                            const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.Pending;
                            const active = selectedId === o.id;
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => openOrder(o.id)}
                                    className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${active ? 'bg-primary-50 dark:bg-primary-950/30 border-l-4 border-l-primary-600' : ''}`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="font-semibold text-sm">{o.customer_name || 'Customer'}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <Clock size={12} /> {fmtTime(o.created_at)}
                                    </div>
                                    <div className="text-xs mt-1 flex items-center gap-1 text-muted-foreground">
                                        <Phone size={12} /> {o.customer_phone}
                                        {o.audio_duration_seconds != null && <> · {Math.round(Number(o.audio_duration_seconds))}s</>}
                                    </div>
                                    <div className="text-xs mt-1 capitalize">{o.delivery_mode || 'delivery'}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
                    {!selectedId && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Mic size={48} className="opacity-30 mb-4" />
                            <p>Select a voice order to listen and create an invoice</p>
                        </div>
                    )}
                    {selectedId && detailLoading && <p>Loading…</p>}
                    {selectedId && detail && !detailLoading && (
                        <div className="max-w-2xl space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-2xl font-bold">{detail.order_number}</h2>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${(STATUS_CONFIG[detail.status] || STATUS_CONFIG.Pending).color}`}>
                                    {(STATUS_CONFIG[detail.status] || STATUS_CONFIG.Pending).label}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1"><User size={14} /> {detail.customer_name}</span>
                                <a href={`tel:${detail.customer_phone}`} className="flex items-center gap-1 text-primary-600"><Phone size={14} /> {detail.customer_phone}</a>
                                {detail.branch_name && <span className="flex items-center gap-1"><MapPin size={14} /> {detail.branch_name}</span>}
                            </div>
                            {detail.delivery_address && (
                                <p className="text-sm"><strong>Address:</strong> {detail.delivery_address}</p>
                            )}
                            {detail.notes && <p className="text-sm bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">{detail.notes}</p>}

                            {detail.audio_url && (
                                <VoiceAudioPlayer
                                    src={getFullImageUrl(detail.audio_url) || detail.audio_url}
                                    duration={Number(detail.audio_duration_seconds || detail.audio_duration)}
                                />
                            )}

                            {detail.transcription_text && (
                                <div className="rounded-xl border p-4 bg-white dark:bg-slate-900">
                                    <h3 className="font-semibold flex items-center gap-2 mb-2"><FileText size={16} /> Transcript</h3>
                                    <p className="text-sm whitespace-pre-wrap">{detail.transcription_text}</p>
                                    {detail.transcription_items?.length ? (
                                        <ul className="mt-3 text-sm space-y-1">
                                            {detail.transcription_items.map((it, i) => (
                                                <li key={i}>• {it.name} ×{it.quantity}{it.unit ? ` ${it.unit}` : ''}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {detail.status === 'Pending' && (
                                    <button type="button" className="btn btn-primary" onClick={() => void markReceived(detail.id)}>
                                        <Check size={16} /> Mark received
                                    </button>
                                )}
                                {['Received', 'Preparing', 'Pending'].includes(detail.status) && !detail.created_invoice_id && (
                                    <button type="button" className="btn btn-primary" onClick={() => createInvoice(detail)}>
                                        <ShoppingCart size={16} /> Create invoice in POS
                                    </button>
                                )}
                                {detail.created_invoice_id && (
                                    <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                                        Linked invoice: {detail.invoice_number} — Rs. {Number(detail.invoice_grand_total || 0).toLocaleString()}
                                    </p>
                                )}
                                {detail.mobile_order_id && (
                                    <a href={`/mobile-orders?order=${encodeURIComponent(detail.mobile_order_id)}`} className="btn btn-secondary">
                                        Open delivery order <ChevronRight size={14} />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
