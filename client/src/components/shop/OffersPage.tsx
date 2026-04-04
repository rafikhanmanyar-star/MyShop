import React, { useEffect, useState, useCallback } from 'react';
import { shopApi } from '../../services/shopApi';
import { Tag, Plus, Pencil, Trash2, X } from 'lucide-react';

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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-muted/50 dark:bg-slate-900/50">
      <div className="border-b border-border bg-card px-6 py-4 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <Tag className="h-6 w-6 text-primary" />
              Offers &amp; Promotions
            </h1>
            <p className="text-sm text-muted-foreground">Manage bundles and discounts for the mobile storefront.</p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            New offer
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {err && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offers.map(o => (
                  <tr key={o.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{o.title}</td>
                    <td className="px-4 py-3 capitalize">{String(o.offer_type).replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {o.start_date && new Date(o.start_date).toLocaleString()}
                      <br />
                      {o.end_date && new Date(o.end_date).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{o.item_count ?? '—'}</td>
                    <td className="px-4 py-3">{o.is_active ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-2 inline-flex rounded p-1 text-primary hover:bg-primary/10"
                        onClick={() => openEdit(o.id)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex rounded p-1 text-destructive hover:bg-destructive/10"
                        onClick={() => deactivate(o.id)}
                        title="Deactivate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {offers.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No offers yet.</div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit offer' : 'New offer'}</h2>
              <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setModalOpen(false)}>
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
