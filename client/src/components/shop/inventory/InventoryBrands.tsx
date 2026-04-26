import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Layers, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { shopApi, type ShopBrand } from '../../../services/shopApi';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import { showAppToast } from '../../../utils/appToast';

const RECENT_DAYS = 7;

const InventoryBrands: React.FC = () => {
    const [brands, setBrands] = useState<ShopBrand[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [saving, setSaving] = useState(false);

    const loadBrands = useCallback(async () => {
        try {
            setLoading(true);
            const list = await shopApi.getShopBrands();
            setBrands(Array.isArray(list) ? list : []);
        } catch (e: any) {
            showAppToast(e?.message || 'Failed to load brands', 'error');
            setBrands([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBrands();
    }, [loadBrands]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let rows = [...brands].sort((a, b) => a.name.localeCompare(b.name));
        if (q) rows = rows.filter((b) => b.name.toLowerCase().includes(q));
        return rows;
    }, [brands, searchQuery]);

    const recentlyUpdatedCount = useMemo(() => {
        const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
        return brands.filter((b) => b.updated_at && new Date(b.updated_at).getTime() >= cutoff).length;
    }, [brands]);

    const openAdd = () => {
        setEditingId(null);
        setFormName('');
        setIsModalOpen(true);
    };

    const openEdit = (b: ShopBrand) => {
        setEditingId(b.id);
        setFormName(b.name);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        const n = formName.trim();
        if (!n) {
            showAppToast('Enter a brand name', 'error');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await shopApi.updateShopBrand(editingId, { name: n });
                showAppToast('Brand updated', 'success');
            } else {
                await shopApi.createShopBrand({ name: n });
                showAppToast('Brand created', 'success');
            }
            setIsModalOpen(false);
            await loadBrands();
        } catch (e: any) {
            showAppToast(e?.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (b: ShopBrand) => {
        if (!window.confirm(`Delete brand "${b.name}"? SKUs using it will have the brand unlinked (not deleted).`)) return;
        try {
            await shopApi.deleteShopBrand(b.id);
            showAppToast('Brand deleted', 'success');
            await loadBrands();
        } catch (e: any) {
            showAppToast(e?.message || 'Delete failed', 'error');
        }
    };

    const shell =
        'min-h-0 flex flex-col flex-1 rounded-xl border border-slate-200/90 bg-[#F8FAFD] shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900/50';

    return (
        <div className={shell}>
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Brands</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            Add and manage product brands. SKUs in New SKU and the mobile app filter use this list.
                        </p>
                    </div>
                    <Button
                        onClick={openAdd}
                        className="rounded-[10px] border-0 bg-[#1E50D5] text-white shadow-sm hover:bg-[#1a47c4]"
                    >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                        Add brand
                    </Button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-[#1E50D5] dark:bg-blue-950/50 dark:text-blue-400">
                                <Tag className="h-5 w-5" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Total brands
                                </p>
                                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                                    {loading ? '—' : brands.length}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                                <Clock className="h-5 w-5" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Recently updated
                                </p>
                                <p
                                    className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white"
                                    title={`Brands created or updated in the last ${RECENT_DAYS} days`}
                                >
                                    {loading ? '—' : recentlyUpdatedCount}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 px-6 pb-4">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        placeholder="Search brands…"
                        aria-label="Search brands"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-[10px] border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#1E50D5] focus:outline-none focus:ring-2 focus:ring-[#1E50D5]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                {loading && brands.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">Loading brands…</p>
                ) : filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                        {brands.length === 0 ? 'No brands yet. Add a brand to use it on SKUs.' : 'No brands match your search.'}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {filtered.map((b) => (
                            <li
                                key={b.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                                        <Layers className="h-5 w-5" />
                                    </div>
                                    <span className="truncate font-semibold text-slate-900 dark:text-white">{b.name}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => openEdit(b)}
                                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E50D5] dark:hover:bg-slate-700"
                                        aria-label={`Edit ${b.name}`}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(b)}
                                        className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                        aria-label={`Delete ${b.name}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => !saving && setIsModalOpen(false)}
                title={editingId ? 'Edit brand' : 'Add brand'}
                size="sm"
            >
                <div className="space-y-4 p-1">
                    <Input
                        label="Brand name"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. Nestlé"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default InventoryBrands;
