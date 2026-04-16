import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { shopApi } from '../../services/shopApi';
import { Plus, Pencil, Trash2, X, Percent, Search, ChevronDown } from 'lucide-react';

type OfferRow = {
  id: string;
  title: string;
  offer_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  item_count?: number;
};

type ProductOpt = { id: string; name: string; sku: string };

type LineDraft = { product_id: string; quantity: number };

function formatOfferType(t: string): string {
  const k = String(t).toLowerCase();
  if (k === 'discount') return 'Discount';
  if (k === 'bundle') return 'Bundle';
  if (k === 'fixed_price') return 'Fixed price';
  return String(t).replace(/_/g, ' ');
}

function formatActiveWindow(start?: string, end?: string) {
  if (!start || !end) return '—';
  return `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleString()}`;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = () => {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    offer_type: 'discount' as 'discount' | 'bundle' | 'fixed_price',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '' as string | number,
    fixed_price: '' as string | number,
    start_date: toLocalInput(start),
    end_date: toLocalInput(end),
    is_active: true,
    max_usage_per_user: '' as string | number,
    items: [] as LineDraft[],
  };
};

export default function OffersPage() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'discount' | 'bundle' | 'fixed_price'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [o, p] = await Promise.all([shopApi.getOffers(), shopApi.getProducts()]);
      setOffers(Array.isArray(o) ? o : []);
      setProducts(Array.isArray(p) ? p.map((x: any) => ({ id: x.id, name: x.name, sku: x.sku })) : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOffers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return offers.filter(o => {
      if (q && !o.title.toLowerCase().includes(q)) return false;
      if (filterType !== 'all' && String(o.offer_type).toLowerCase() !== filterType) return false;
      if (filterStatus === 'active' && !o.is_active) return false;
      if (filterStatus === 'inactive' && o.is_active) return false;
      return true;
    });
  }, [offers, searchQuery, filterType, filterStatus]);

  const toggleActive = async (o: OfferRow) => {
    if (togglingId) return;
    setTogglingId(o.id);
    setErr('');
    const next = !o.is_active;
    try {
      await shopApi.updateOffer(o.id, { is_active: next });
      setOffers(prev => prev.map(x => (x.id === o.id ? { ...x, is_active: next } : x)));
    } catch (e: any) {
      setErr(e?.message || 'Failed to update status');
    } finally {
      setTogglingId(null);
    }
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = async (id: string) => {
    try {
      const o = await shopApi.getOffer(id);
      setEditingId(id);
      const start = o.start_date ? new Date(o.start_date) : new Date();
      const end = o.end_date ? new Date(o.end_date) : new Date();
      const toLocal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setForm({
        title: o.title || '',
        description: o.description || '',
        offer_type: o.offer_type || 'discount',
        discount_type: o.discount_type || 'percentage',
        discount_value: o.discount_value ?? '',
        fixed_price: o.fixed_price ?? '',
        start_date: toLocal(start),
        end_date: toLocal(end),
        is_active: !!o.is_active,
        max_usage_per_user: o.max_usage_per_user ?? '',
        items: (o.items || []).map((it: any) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity) || 1,
        })),
      });
      setModalOpen(true);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load offer');
    }
  };

  const addLine = () => {
    const first = products[0]?.id;
    if (!first) return;
    setForm(f => ({
      ...f,
      items: [...f.items, { product_id: first, quantity: 1 }],
    }));
  };

  const setLine = (idx: number, patch: Partial<LineDraft>) => {
    setForm(f => ({
      ...f,
      items: f.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const removeLine = (idx: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setErr('Title is required');
      return;
    }
    if (!form.items.length) {
      setErr('Add at least one product');
      return;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      offer_type: form.offer_type,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      is_active: form.is_active,
      max_usage_per_user: form.max_usage_per_user === '' ? null : Number(form.max_usage_per_user),
      items: form.items.map(it => ({
        product_id: it.product_id,
        quantity: Number(it.quantity) || 1,
      })),
    };
    if (form.offer_type === 'discount') {
      payload.discount_type = form.discount_type;
      payload.discount_value = Number(form.discount_value);
      payload.fixed_price = null;
    } else {
      payload.discount_type = null;
      payload.discount_value = null;
      payload.fixed_price = Number(form.fixed_price);
    }

    setSaving(true);
    setErr('');
    try {
      if (editingId) {
        await shopApi.updateOffer(editingId, payload);
      } else {
        await shopApi.createOffer(payload);
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this offer? It will disappear from the mobile app.')) return;
    try {
      await shopApi.deleteOffer(id);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Failed');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-100/90 dark:bg-slate-950/80">
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1400px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-none">
          {/* Page header */}
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-6 dark:border-slate-700/80">
            <div className="flex min-w-0 gap-3 sm:gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                aria-hidden
              >
                <Percent className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
                  Offers &amp; Promotions
                </h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Manage bundles and discounts for the mobile storefront.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New Offer
            </button>
          </div>

          {err && (
            <div className="mx-5 mb-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 sm:mx-6">
              {err}
            </div>
          )}

          {/* Search & filters */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-700/80">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="search"
                placeholder="Search offers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <div className="relative min-w-[10.5rem] flex-1 sm:flex-initial">
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as typeof filterType)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  aria-label="Filter by type"
                >
                  <option value="all">Filter by Type</option>
                  <option value="discount">Discount</option>
                  <option value="bundle">Bundle</option>
                  <option value="fixed_price">Fixed price</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
              <div className="relative min-w-[10.5rem] flex-1 sm:flex-initial">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  aria-label="Filter by status"
                >
                  <option value="all">Filter by Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                    <th className="w-12 px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="min-w-[14rem] px-4 py-3">Active window</th>
                    <th className="px-4 py-3">Linked products</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
                  {filteredOffers.map((o, idx) => (
                    <tr
                      key={o.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3.5 text-center text-slate-500 tabular-nums dark:text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">{o.title}</td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">{formatOfferType(o.offer_type)}</td>
                      <td className="px-4 py-3.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {formatActiveWindow(o.start_date, o.end_date)}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-slate-800 dark:text-slate-200">
                        {o.item_count ?? '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-medium ${o.is_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                          >
                            {o.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={o.is_active ? 'true' : 'false'}
                            aria-label={`${o.is_active ? 'Deactivate' : 'Activate'} offer “${o.title}”`}
                            disabled={togglingId === o.id}
                            onClick={() => void toggleActive(o)}
                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900 ${
                              o.is_active
                                ? 'bg-emerald-500 dark:bg-emerald-600'
                                : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          >
                            <span
                              className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                                o.is_active ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-blue-500 text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/40"
                            onClick={() => openEdit(o.id)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-red-500 text-red-600 transition-colors hover:bg-red-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950/40"
                            onClick={() => deactivate(o.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {offers.length === 0 && (
                <div className="px-4 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                  No offers yet.
                </div>
              )}
              {offers.length > 0 && filteredOffers.length === 0 && (
                <div className="px-4 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                  No offers match your filters.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit offer' : 'New offer'}</h2>
              <button
                type="button"
                title="Close"
                className="rounded p-1 hover:bg-muted"
                onClick={() => setModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">Title</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              <label className="block text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Offer type</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.offer_type}
                    onChange={e =>
                      setForm(f => ({ ...f, offer_type: e.target.value as typeof f.offer_type }))
                    }
                  >
                    <option value="discount">Discount</option>
                    <option value="bundle">Bundle (fixed price)</option>
                    <option value="fixed_price">Fixed price</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
              </div>

              {form.offer_type === 'discount' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Discount type</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={form.discount_type}
                      onChange={e =>
                        setForm(f => ({ ...f, discount_type: e.target.value as typeof f.discount_type }))
                      }
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Value</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={form.discount_value}
                      onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {(form.offer_type === 'bundle' || form.offer_type === 'fixed_price') && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Fixed price (per bundle)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.fixed_price}
                    onChange={e => setForm(f => ({ ...f, fixed_price: e.target.value }))}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Start</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">End</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground">Max uses per customer (optional)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.max_usage_per_user}
                  onChange={e => setForm(f => ({ ...f, max_usage_per_user: e.target.value }))}
                  min={1}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Products in offer</span>
                  <button type="button" className="text-xs font-semibold text-primary" onClick={addLine}>
                    + Add product
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((line, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm"
                        value={line.product_id}
                        onChange={e => setLine(idx, { product_id: e.target.value })}
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="w-24 rounded-lg border border-border bg-background px-2 py-2 text-sm"
                        value={line.quantity}
                        onChange={e => setLine(idx, { quantity: Number(e.target.value) })}
                      />
                      <button type="button" className="text-destructive" onClick={() => removeLine(idx)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={submit}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
