import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    customerFeedbackApi,
    type CustomerFeedbackItem,
    type FeedbackPriority,
    type FeedbackStatus,
} from '../../../services/customerFeedbackApi';
import { getFullImageUrl } from '../../../config/apiUrl';
import { MessageSquare, RefreshCw, Search, TrendingUp, AlertTriangle } from 'lucide-react';

const MODULES = [
    { key: 'all', label: 'All Feedback' },
    { key: 'product_requests', label: 'Product Requests' },
    { key: 'complaints', label: 'Complaints' },
    { key: 'delivery', label: 'Delivery Issues' },
    { key: 'suggestions', label: 'Suggestions' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'analytics', label: 'Analytics' },
] as const;

const STATUS_COLORS: Record<FeedbackStatus, string> = {
    submitted: 'bg-blue-100 text-blue-800',
    under_review: 'bg-amber-100 text-amber-800',
    responded: 'bg-emerald-100 text-emerald-800',
    resolved: 'bg-slate-100 text-slate-600',
};

const PRIORITY_COLORS: Record<FeedbackPriority, string> = {
    low: 'bg-slate-100 text-slate-600',
    normal: 'bg-sky-100 text-sky-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
};

function typeLabel(t: string) {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CustomerFeedbackPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const module = searchParams.get('module') || 'all';
    const selectedId = searchParams.get('id');

    const [items, setItems] = useState<CustomerFeedbackItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [detail, setDetail] = useState<CustomerFeedbackItem | null>(null);
    const [replyText, setReplyText] = useState('');
    const [stats, setStats] = useState<Record<string, number>>({});
    const [analytics, setAnalytics] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    const loadList = useCallback(async () => {
        if (module === 'analytics') {
            setLoading(true);
            try {
                const [a, s] = await Promise.all([
                    customerFeedbackApi.analytics(),
                    customerFeedbackApi.stats(),
                ]);
                setAnalytics(a);
                setStats(s);
            } finally {
                setLoading(false);
            }
            return;
        }
        setLoading(true);
        try {
            const res = await customerFeedbackApi.list({
                module,
                search: search.trim() || undefined,
                limit: 80,
            });
            setItems(res.items || []);
            setTotal(res.total || 0);
            const s = await customerFeedbackApi.stats();
            setStats(s);
        } finally {
            setLoading(false);
        }
    }, [module, search]);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const loadDetail = useCallback(async (id: string) => {
        try {
            setDetail(await customerFeedbackApi.get(id));
        } catch {
            setDetail(null);
        }
    }, []);

    useEffect(() => {
        if (selectedId && module !== 'analytics') void loadDetail(selectedId);
        else setDetail(null);
    }, [selectedId, module, loadDetail]);

    const selectModule = (key: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('module', key);
        next.delete('id');
        setSearchParams(next);
    };

    const selectItem = (id: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('id', id);
        setSearchParams(next);
    };

    const sendReply = async (opts?: { isThankYou?: boolean; status?: FeedbackStatus }) => {
        if (!detail || !replyText.trim()) return;
        setSaving(true);
        try {
            const updated = await customerFeedbackApi.reply(detail.id, {
                message: replyText.trim(),
                isThankYou: opts?.isThankYou,
                status: opts?.status,
            });
            setDetail(updated);
            setReplyText('');
            void loadList();
        } finally {
            setSaving(false);
        }
    };

    const markResolved = async () => {
        if (!detail) return;
        setSaving(true);
        try {
            const updated = await customerFeedbackApi.update(detail.id, { status: 'resolved' });
            setDetail(updated);
            void loadList();
        } finally {
            setSaving(false);
        }
    };

    const setPriority = async (priority: FeedbackPriority) => {
        if (!detail) return;
        const updated = await customerFeedbackApi.update(detail.id, { priority });
        setDetail(updated);
        void loadList();
    };

    const headerStats = useMemo(
        () => [
            { label: 'Open', value: stats.open_count ?? 0 },
            { label: 'Urgent', value: stats.urgent_count ?? 0 },
            { label: 'Product requests', value: stats.product_requests_open ?? 0 },
            { label: 'Avg rating', value: stats.avg_overall_rating ?? '—' },
        ],
        [stats]
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <MessageSquare size={22} /> Customer Feedback
                    </h1>
                    <p className="text-sm text-muted-foreground">Manage feedback, product requests, and replies</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadList()}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {headerStats.map((s) => (
                    <div key={s.label} className="rounded-lg border px-3 py-2 text-sm">
                        <div className="text-muted-foreground text-xs">{s.label}</div>
                        <div className="font-bold">{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                {MODULES.map((m) => (
                    <button
                        key={m.key}
                        type="button"
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${module === m.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-background'}`}
                        onClick={() => selectModule(m.key)}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {module === 'analytics' ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="card p-4">
                        <h2 className="font-bold flex items-center gap-2 mb-3"><TrendingUp size={18} /> Most requested products</h2>
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {(analytics?.topProducts || []).map((p: any) => (
                                    <li key={p.normalized_key} className="flex justify-between gap-2 border-b pb-2">
                                        <span>
                                            {p.product_name}
                                            {p.brand ? ` · ${p.brand}` : ''}
                                            {p.high_demand && (
                                                <span className="ml-2 text-xs font-bold text-orange-700">High demand</span>
                                            )}
                                        </span>
                                        <span className="text-muted-foreground whitespace-nowrap">{p.request_count} req · {p.customer_count} customers</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="card p-4">
                        <h2 className="font-bold mb-3">Trending brands</h2>
                        <ul className="space-y-2 text-sm">
                            {(analytics?.trendingBrands || []).map((b: any) => (
                                <li key={b.brand} className="flex justify-between border-b pb-2">
                                    <span>{b.brand}</span>
                                    <span>{b.request_count}</span>
                                </li>
                            ))}
                        </ul>
                        {analytics?.summary?.high_demand_count > 0 && (
                            <p className="mt-3 text-sm text-orange-700 flex items-center gap-1">
                                <AlertTriangle size={14} /> {analytics.summary.high_demand_count} products have 3+ requests — consider adding to inventory.
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 gap-4">
                    <div className="flex min-h-0 w-full max-w-md flex-col gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                className="input pl-9 w-full"
                                placeholder="Search feedback…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void loadList()}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">{total} items</p>
                        <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Loading…</p>
                            ) : items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No feedback found.</p>
                            ) : (
                                items.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => selectItem(item.id)}
                                        className={`w-full text-left rounded-lg border p-3 text-sm hover:bg-muted/40 ${selectedId === item.id ? 'border-primary-500 bg-primary-50/50' : ''}`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-semibold">{item.customer_name || item.customer_phone || 'Customer'}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PRIORITY_COLORS[item.priority]}`}>{item.priority}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{typeLabel(item.feedback_type)}</p>
                                        <p className="line-clamp-2 mt-1">{item.product_request?.product_name || item.message}</p>
                                        <div className="flex gap-2 mt-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[item.status]}`}>{item.status.replace(/_/g, ' ')}</span>
                                            {(item.demand_count || 0) >= 3 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-800">{item.demand_count} requests</span>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-4">
                        {!detail ? (
                            <p className="text-sm text-muted-foreground">Select feedback to view details and reply.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <h2 className="font-bold text-lg">{detail.customer_name || 'Customer'}</h2>
                                        <p className="text-sm text-muted-foreground">{detail.customer_phone}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <select className="input text-xs" value={detail.priority} onChange={(e) => void setPriority(e.target.value as FeedbackPriority)}>
                                            {(['low', 'normal', 'high', 'urgent'] as FeedbackPriority[]).map((p) => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void markResolved()} disabled={saving}>
                                            Mark resolved
                                        </button>
                                    </div>
                                </div>

                                <div className="text-sm space-y-1">
                                    <p><strong>Type:</strong> {typeLabel(detail.feedback_type)}</p>
                                    <p><strong>Status:</strong> {detail.status.replace(/_/g, ' ')}</p>
                                    {detail.overall_rating != null && <p><strong>Overall rating:</strong> {detail.overall_rating}/5</p>}
                                    <p className="whitespace-pre-wrap mt-2">{detail.message}</p>
                                </div>

                                {detail.product_request?.product_name && (
                                    <div className="rounded-lg bg-muted/40 p-3 text-sm">
                                        <p className="font-semibold">Product request</p>
                                        <p>{detail.product_request.product_name}</p>
                                        {detail.product_request.brand && <p>Brand: {detail.product_request.brand}</p>}
                                        {detail.product_request.category && <p>Category: {detail.product_request.category}</p>}
                                        {(detail.demand_count || 0) >= 3 && (
                                            <p className="text-orange-700 font-semibold mt-1">High demand — {detail.demand_count} customers requested similar items</p>
                                        )}
                                    </div>
                                )}

                                {(detail.attachments || []).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {detail.attachments!.map((a) => (
                                            <a key={a.id} href={getFullImageUrl(a.url)} target="_blank" rel="noreferrer">
                                                <img src={getFullImageUrl(a.url)} alt="" className="h-20 w-20 rounded object-cover border" />
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {(detail.replies || []).length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-sm">Conversation</h3>
                                        {detail.replies!.map((r) => (
                                            <div key={r.id} className={`rounded-lg p-2 text-sm ${r.author_type === 'staff' ? 'bg-primary-50' : 'bg-muted/50'}`}>
                                                <p className="font-semibold text-xs">{r.author_name || r.author_type}</p>
                                                <p>{r.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="space-y-2 border-t pt-3">
                                    <textarea
                                        className="input w-full min-h-[80px]"
                                        placeholder="Reply to customer…"
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className="btn btn-primary btn-sm" disabled={saving || !replyText.trim()} onClick={() => void sendReply()}>
                                            Send reply
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" disabled={saving || !replyText.trim()} onClick={() => void sendReply({ isThankYou: true })}>
                                            Thank customer
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
