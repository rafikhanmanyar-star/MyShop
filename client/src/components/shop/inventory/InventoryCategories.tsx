import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ArrowDownUp,
    ArrowDownWideNarrow,
    ChevronDown,
    ChevronRight,
    Clock,
    Download,
    Filter,
    GitBranch,
    GripHorizontal,
    Layers,
    Move,
    Pencil,
    Plus,
    Search,
    Trash2,
    Upload,
} from 'lucide-react';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { createCategoryOfflineFirst } from '../../../services/categorySyncService';
import { getBaseUrl } from '../../../config/apiUrl';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import { showAppToast } from '../../../utils/appToast';

type CategoryKind = 'main' | 'sub';

type CategoryFilter = 'all' | 'with_subs' | 'without_subs';
type SortDir = 'az' | 'za';

interface CategoryTree {
    category: ShopProductCategory;
    children: ShopProductCategory[];
}

const RECENT_DAYS = 7;
const EXPORT_VERSION = 1;

const InventoryCategories: React.FC = () => {
    const [categories, setCategories] = useState<ShopProductCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [categoryKind, setCategoryKind] = useState<CategoryKind>('main');
    const [parentId, setParentId] = useState('');
    const [saving, setSaving] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [formMobileIconUrl, setFormMobileIconUrl] = useState<string | null>(null);
    const [iconUploading, setIconUploading] = useState(false);
    const iconFileRef = useRef<HTMLInputElement>(null);
    const importFileRef = useRef<HTMLInputElement>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
    const [sortDir, setSortDir] = useState<SortDir>('az');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveTargetParentId, setMoveTargetParentId] = useState('');

    const mainCategories = useMemo(
        () =>
            [...categories]
                .filter((c) => !c.parent_id)
                .sort((a, b) => a.name.localeCompare(b.name)),
        [categories]
    );

    const categoryTree = useMemo<CategoryTree[]>(() => {
        const subsByParent = new Map<string, ShopProductCategory[]>();
        for (const cat of categories) {
            if (cat.parent_id) {
                const list = subsByParent.get(cat.parent_id) || [];
                list.push(cat);
                subsByParent.set(cat.parent_id, list);
            }
        }
        return mainCategories.map((main) => ({
            category: main,
            children: (subsByParent.get(main.id) || []).sort((a, b) =>
                a.name.localeCompare(b.name)
            ),
        }));
    }, [categories, mainCategories]);

    const filteredTree = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let rows = categoryTree.map((row) => ({ ...row }));

        if (q) {
            rows = rows
                .map(({ category: main, children: subs }) => {
                    const mainHit = main.name.toLowerCase().includes(q);
                    const subHits = subs.filter((s) => s.name.toLowerCase().includes(q));
                    if (mainHit) return { category: main, children: subs };
                    if (subHits.length) return { category: main, children: subHits };
                    return null;
                })
                .filter((r): r is CategoryTree => r !== null);
        }

        if (categoryFilter === 'with_subs') {
            rows = rows.filter((r) => r.children.length > 0);
        } else if (categoryFilter === 'without_subs') {
            rows = rows.filter((r) => r.children.length === 0);
        }

        rows = [...rows].sort((a, b) =>
            sortDir === 'az'
                ? a.category.name.localeCompare(b.category.name)
                : b.category.name.localeCompare(a.category.name)
        );
        return rows;
    }, [categoryTree, searchQuery, categoryFilter, sortDir]);

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedIds(
            new Set(
                filteredTree
                    .filter((r) => r.children.length > 0)
                    .map((r) => r.category.id)
            )
        );
    };

    const collapseAll = () => setExpandedIds(new Set());

    const allExpanded = useMemo(() => {
        const withChildren = filteredTree.filter((r) => r.children.length > 0);
        return (
            withChildren.length > 0 &&
            withChildren.every((r) => expandedIds.has(r.category.id))
        );
    }, [filteredTree, expandedIds]);

    const totalSubs = categories.filter((c) => c.parent_id).length;
    const mainCount = mainCategories.length;

    const recentlyUpdatedCount = useMemo(() => {
        const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
        return categories.filter((c) => {
            if (!c.created_at) return false;
            return new Date(c.created_at).getTime() >= cutoff;
        }).length;
    }, [categories]);

    const loadCategories = useCallback(async () => {
        try {
            setError(null);
            const list = await getShopCategoriesOfflineFirst();
            setCategories(Array.isArray(list) ? list : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load categories');
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const openAdd = (presetParentId?: string) => {
        setEditingId(null);
        setFormName('');
        setFormMobileIconUrl(null);
        if (presetParentId) {
            setCategoryKind('sub');
            setParentId(presetParentId);
        } else {
            setCategoryKind('main');
            setParentId('');
        }
        setIsModalOpen(true);
    };

    const openEdit = (cat: ShopProductCategory) => {
        setEditingId(cat.id);
        setFormName(cat.name);
        setFormMobileIconUrl(cat.mobile_icon_url ?? null);
        const isSub = Boolean(cat.parent_id);
        setCategoryKind(isSub ? 'sub' : 'main');
        setParentId(isSub && cat.parent_id ? cat.parent_id : '');
        setIsModalOpen(true);
    };

    const resolveIconPreviewUrl = (path: string | null) => {
        if (!path || !path.trim()) return null;
        const p = path.trim();
        if (p.startsWith('http://') || p.startsWith('https://')) return p;
        return `${getBaseUrl()}${p.startsWith('/') ? p : `/${p}`}`;
    };

    const handleIconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !editingId) return;
        setIconUploading(true);
        setError(null);
        try {
            const { imageUrl } = await shopApi.uploadCategoryIcon(file);
            setFormMobileIconUrl(imageUrl);
        } catch (err: any) {
            setError(err?.message || err?.error || 'Could not upload icon');
        } finally {
            setIconUploading(false);
        }
    };

    const handleSave = async () => {
        const name = formName.trim();
        if (!name) return;
        if (categoryKind === 'sub' && !parentId) return;
        const resolvedParentId = categoryKind === 'sub' ? parentId : null;
        setSaving(true);
        try {
            if (editingId) {
                await shopApi.updateShopCategory(editingId, {
                    name,
                    parentId: resolvedParentId,
                    mobileIconUrl: formMobileIconUrl,
                });
            } else {
                const result = await createCategoryOfflineFirst(name, resolvedParentId);
                if (!result.synced && result.localId) {
                    setCategories((prev) => [
                        ...prev,
                        {
                            id: result.localId!,
                            name,
                            type: 'product',
                            parent_id: resolvedParentId,
                            created_at: new Date().toISOString(),
                        },
                    ]);
                }
            }
            setIsModalOpen(false);
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to save category');
        } finally {
            setSaving(false);
        }
    };

    const canSubmit =
        formName.trim().length > 0 &&
        (categoryKind === 'main' || parentId.length > 0) &&
        !saving;

    const handleDelete = async (id: string) => {
        const hasSubs = categories.some((c) => c.parent_id === id);
        const msg = hasSubs
            ? 'Remove this category and all its subcategories? Products using them will have their category cleared.'
            : 'Remove this category? Products using it will have their category cleared.';
        if (!window.confirm(msg)) return;
        try {
            await shopApi.deleteShopCategory(id);
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete category');
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleExport = () => {
        const payload = {
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            categories,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `categories-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showAppToast('Categories exported', 'success');
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const list: ShopProductCategory[] = Array.isArray(data)
                ? data
                : data.categories;
            if (!Array.isArray(list) || list.length === 0) {
                showAppToast('Invalid file: expected a categories array', 'error');
                return;
            }
            if (
                !window.confirm(
                    `Import ${list.length} categor${list.length === 1 ? 'y' : 'ies'} from file? New rows will be created (existing names may still duplicate).`
                )
            ) {
                return;
            }
            const mains = list.filter((c) => !c.parent_id);
            const subs = list.filter((c) => c.parent_id);
            const idMap = new Map<string, string>();
            for (const m of mains) {
                const name = (m.name || '').trim();
                if (!name) continue;
                const { id } = await shopApi.createShopCategory({ name, parentId: null });
                idMap.set(m.id, id);
            }
            for (const s of subs) {
                const name = (s.name || '').trim();
                if (!name) continue;
                const oldParent = s.parent_id!;
                const newParent = idMap.get(oldParent);
                if (!newParent) continue;
                await shopApi.createShopCategory({ name, parentId: newParent });
            }
            await loadCategories();
            showAppToast('Import finished', 'success');
        } catch (err: any) {
            showAppToast(err?.message || 'Import failed', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (
            !window.confirm(
                `Delete ${selectedIds.size} selected categor${selectedIds.size === 1 ? 'y' : 'ies'}? Products using them will have their category cleared.`
            )
        ) {
            return;
        }
        const selected = [...selectedIds];
        const subs = selected.filter((id) => categories.some((c) => c.id === id && c.parent_id));
        const mains = selected.filter((id) => categories.some((c) => c.id === id && !c.parent_id));
        try {
            for (const id of subs) {
                await shopApi.deleteShopCategory(id);
            }
            for (const id of mains) {
                await shopApi.deleteShopCategory(id);
            }
            setSelectedIds(new Set());
            await loadCategories();
            showAppToast('Selected categories removed', 'success');
        } catch (e: any) {
            setError(e?.message || 'Bulk delete failed');
            showAppToast(e?.message || 'Bulk delete failed', 'error');
        }
    };

    const openMoveModal = () => {
        const subsSelected = [...selectedIds].filter((id) =>
            categories.some((c) => c.id === id && c.parent_id)
        );
        if (subsSelected.length === 0) {
            showAppToast('Select at least one subcategory to move', 'info');
            return;
        }
        const firstParent = categories.find((c) => c.id === subsSelected[0])?.parent_id;
        const sameParent = subsSelected.every(
            (id) => categories.find((c) => c.id === id)?.parent_id === firstParent
        );
        setMoveTargetParentId(sameParent && firstParent ? firstParent : mainCategories[0]?.id || '');
        setIsMoveModalOpen(true);
    };

    const handleBulkMove = async () => {
        if (!moveTargetParentId) return;
        const subsSelected = [...selectedIds].filter((id) =>
            categories.some((c) => c.id === id && c.parent_id)
        );
        setSaving(true);
        try {
            for (const id of subsSelected) {
                const cat = categories.find((c) => c.id === id);
                if (!cat || cat.parent_id === moveTargetParentId) continue;
                await shopApi.updateShopCategory(id, {
                    name: cat.name,
                    parentId: moveTargetParentId,
                    mobileIconUrl: cat.mobile_icon_url ?? null,
                });
            }
            setIsMoveModalOpen(false);
            setSelectedIds(new Set());
            await loadCategories();
            showAppToast('Subcategories moved', 'success');
        } catch (e: any) {
            showAppToast(e?.message || 'Move failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const applyBulkDone = () => {
        setSelectedIds(new Set());
        showAppToast('Selection cleared', 'info', 2500);
    };

    const shell = 'min-h-0 flex flex-col flex-1 rounded-xl border border-slate-200/90 bg-[#F8FAFD] shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900/50';

    return (
        <div className={shell}>
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Management Suite
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                            Manage categories and subcategories for inventory organization.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={importFileRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            aria-label="Import categories from JSON file"
                            onChange={handleImportFile}
                        />
                        <div className="inline-flex rounded-[10px] border border-blue-200/90 bg-white shadow-sm overflow-hidden dark:border-slate-600 dark:bg-slate-800">
                            <button
                                type="button"
                                onClick={() => importFileRef.current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E50D5] hover:bg-blue-50/80 dark:text-blue-400 dark:hover:bg-slate-700/80"
                            >
                                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                                Import
                            </button>
                            <span className="w-px bg-blue-200/90 dark:bg-slate-600" aria-hidden />
                            <button
                                type="button"
                                onClick={handleExport}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E50D5] hover:bg-blue-50/80 dark:text-blue-400 dark:hover:bg-slate-700/80"
                            >
                                <Download className="h-4 w-4 shrink-0" aria-hidden />
                                Export
                            </button>
                        </div>
                        <Button
                            onClick={() => openAdd()}
                            className="rounded-[10px] bg-[#1E50D5] hover:bg-[#1a47c4] text-white shadow-sm border-0"
                        >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                            Add Category
                        </Button>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-[#1E50D5] dark:bg-blue-950/50 dark:text-blue-400">
                                <Layers className="h-5 w-5" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Total categories
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                                    {loading ? '—' : mainCount}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-[#1E50D5] dark:bg-blue-950/50 dark:text-blue-400">
                                <GitBranch className="h-5 w-5" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Subcategories
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                                    {loading ? '—' : totalSubs}
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
                                    className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums"
                                    title={`Categories created or added in the last ${RECENT_DAYS} days`}
                                >
                                    {loading ? '—' : recentlyUpdatedCount}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 px-6 pb-4">
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-slate-100/60 p-3 dark:border-slate-700 dark:bg-slate-800/40 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative min-w-[200px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Search categories..."
                            aria-label="Search categories"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-[10px] border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#1E50D5] focus:outline-none focus:ring-2 focus:ring-[#1E50D5]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900">
                            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400">Filter:</span>
                            <select
                                aria-label="Filter categories"
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                                className="border-0 bg-transparent py-0.5 pl-1 pr-6 text-sm font-medium text-slate-800 focus:outline-none focus:ring-0 dark:text-slate-200 cursor-pointer"
                            >
                                <option value="all">All</option>
                                <option value="with_subs">With subcategories</option>
                                <option value="without_subs">Without subcategories</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSortDir((s) => (s === 'az' ? 'za' : 'az'))}
                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <ArrowDownWideNarrow className="h-4 w-4 text-slate-500" />
                            Sort: {sortDir === 'az' ? 'A-Z' : 'Z-A'}
                        </button>
                        {filteredTree.some((r) => r.children.length > 0) && (
                            <button
                                type="button"
                                onClick={allExpanded ? collapseAll : expandAll}
                                className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-2 text-sm font-medium text-[#1E50D5] hover:underline dark:text-blue-400"
                            >
                                <ArrowDownUp className="h-4 w-4" />
                                {allExpanded ? 'Collapse all' : 'Expand all'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-28 overscroll-contain">
                {loading && <p className="text-sm text-slate-500">Loading…</p>}
                {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                {!loading && categories.length === 0 && !error && (
                    <p className="text-sm text-slate-500">
                        No categories yet. Add one to use in product creation.
                    </p>
                )}
                {!loading && categories.length > 0 && filteredTree.length === 0 && (
                    <p className="text-sm text-slate-500">No categories match your search or filters.</p>
                )}
                {!loading && filteredTree.length > 0 && (
                    <div className="space-y-2">
                        {filteredTree.map(({ category: main, children: subs }) => {
                            const hasSubs = subs.length > 0;
                            const isExpanded = expandedIds.has(main.id);
                            return (
                                <div
                                    key={main.id}
                                    className="rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/90"
                                >
                                    <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                                        <span
                                            className="hidden text-slate-300 sm:inline-flex sm:cursor-grab dark:text-slate-600"
                                            title="Reorder (coming soon)"
                                            aria-hidden
                                        >
                                            <GripHorizontal className="h-4 w-4" />
                                        </span>
                                        <label className="flex cursor-pointer items-center">
                                            <input
                                                type="checkbox"
                                                aria-label={`Select category ${main.name}`}
                                                checked={selectedIds.has(main.id)}
                                                onChange={() => toggleSelect(main.id)}
                                                className="h-4 w-4 rounded border-slate-300 text-[#1E50D5] focus:ring-[#1E50D5]/30"
                                            />
                                        </label>
                                        {hasSubs ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(main.id)}
                                                aria-label={
                                                    isExpanded
                                                        ? 'Collapse subcategories'
                                                        : 'Expand subcategories'
                                                }
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="h-5 w-5" />
                                                ) : (
                                                    <ChevronRight className="h-5 w-5" />
                                                )}
                                            </button>
                                        ) : (
                                            <span className="w-8 shrink-0" />
                                        )}
                                        <div
                                            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-blue-100 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/40"
                                            title="Mobile app icon"
                                        >
                                            {main.mobile_icon_url ? (
                                                <img
                                                    src={
                                                        resolveIconPreviewUrl(main.mobile_icon_url) ??
                                                        undefined
                                                    }
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Layers className="h-5 w-5 text-blue-300 dark:text-blue-600" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="font-semibold text-slate-900 dark:text-white">
                                                {main.name}
                                            </span>
                                        </div>
                                        {hasSubs && (
                                            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1E50D5] sm:px-2.5 sm:py-1 sm:text-[11px] dark:bg-blue-950/50 dark:text-blue-300 max-w-[120px] truncate sm:max-w-none">
                                                {subs.length} subcategories
                                            </span>
                                        )}
                                        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                                            <button
                                                type="button"
                                                onClick={() => openAdd(main.id)}
                                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-[#1E50D5] dark:hover:bg-slate-700"
                                                title="Add subcategory"
                                            >
                                                <Plus className="h-4 w-4" strokeWidth={2.5} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openEdit(main)}
                                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                title="Edit"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(main.id)}
                                                className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {hasSubs && isExpanded && (
                                        <div className="border-t border-slate-100 px-3 pb-3 pt-0 dark:border-slate-700 sm:px-4">
                                            {subs.map((sub) => (
                                                <div
                                                    key={sub.id}
                                                    className="relative ml-3 flex items-center gap-2 border-l-2 border-blue-200 py-2 pl-4 dark:border-blue-900"
                                                >
                                                    <label className="flex cursor-pointer items-center">
                                                        <input
                                                            type="checkbox"
                                                            aria-label={`Select subcategory ${sub.name}`}
                                                            checked={selectedIds.has(sub.id)}
                                                            onChange={() => toggleSelect(sub.id)}
                                                            className="h-4 w-4 rounded border-slate-300 text-[#1E50D5] focus:ring-[#1E50D5]/30"
                                                        />
                                                    </label>
                                                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
                                                        {sub.name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(sub)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(sub.id)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedIds.size > 0 && (
                <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-[min(100%-2rem,560px)] -translate-x-1/2 px-4">
                    <div className="pointer-events-auto flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-lg dark:border-slate-600 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1E3A6E] text-sm font-semibold text-white tabular-nums dark:bg-blue-900">
                                    {selectedIds.size}
                                </span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    Items selected
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={openMoveModal}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            >
                                <Move className="h-4 w-4" />
                                Move to
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkDelete}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            >
                                <Trash2 className="h-4 w-4" />
                                Bulk delete
                            </button>
                        </div>
                        <Button
                            type="button"
                            onClick={applyBulkDone}
                            className="w-full shrink-0 rounded-[10px] bg-[#1E3A6E] px-5 hover:bg-[#152a52] text-white sm:w-auto border-0"
                        >
                            Apply changes
                        </Button>
                    </div>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Edit Category' : 'Add Category'}
                size="sm"
            >
                <div className="space-y-4">
                    <Input
                        label="Category name"
                        placeholder="e.g. Food, Apparel"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <div>
                        <div className="mb-2 block text-sm font-medium text-foreground">
                            Category type
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                    type="radio"
                                    name="category-kind"
                                    className="text-green-600 focus:ring-green-500"
                                    checked={categoryKind === 'main'}
                                    onChange={() => {
                                        setCategoryKind('main');
                                        setParentId('');
                                    }}
                                />
                                Main category
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                    type="radio"
                                    name="category-kind"
                                    className="text-green-600 focus:ring-green-500"
                                    checked={categoryKind === 'sub'}
                                    onChange={() => setCategoryKind('sub')}
                                />
                                Sub category
                            </label>
                        </div>
                    </div>
                    {editingId && (
                        <div className="space-y-2">
                            <div className="block text-sm font-medium text-foreground">
                                Mobile app icon
                            </div>
                            <p className="text-xs text-muted-foreground">
                                JPEG, PNG, or WebP — resized to 256×256 for the customer app. Optional
                                for subcategories.
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                                    {formMobileIconUrl ? (
                                        <img
                                            src={resolveIconPreviewUrl(formMobileIconUrl) || undefined}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">No icon</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <input
                                        ref={iconFileRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        className="hidden"
                                        aria-label="Upload category icon image"
                                        onChange={handleIconFile}
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={iconUploading}
                                        onClick={() => iconFileRef.current?.click()}
                                    >
                                        {iconUploading ? 'Uploading…' : 'Upload icon'}
                                    </Button>
                                    {formMobileIconUrl && (
                                        <button
                                            type="button"
                                            className="text-left text-xs text-rose-600 hover:underline"
                                            onClick={() => setFormMobileIconUrl(null)}
                                        >
                                            Remove icon
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {!editingId && (
                        <p className="text-xs text-muted-foreground">
                            Save the new category first, then use Edit to upload a mobile app icon.
                        </p>
                    )}
                    {categoryKind === 'sub' && (
                        <div className="space-y-1">
                            <Select
                                label="Parent category"
                                value={parentId}
                                onChange={(e) => setParentId(e.target.value)}
                                required
                            >
                                <option value="">Select a main category</option>
                                {mainCategories
                                    .filter((m) => !editingId || m.id !== editingId)
                                    .map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                            </Select>
                            {mainCategories.length === 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    Add at least one main category first, then you can create
                                    subcategories under it.
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={!canSubmit}>
                            {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                title="Move subcategories"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Choose a main category to assign the selected subcategories to.
                    </p>
                    <Select
                        label="Target category"
                        value={moveTargetParentId}
                        onChange={(e) => setMoveTargetParentId(e.target.value)}
                    >
                        <option value="">Select main category</option>
                        {mainCategories.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </Select>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsMoveModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleBulkMove}
                            disabled={!moveTargetParentId || saving}
                            className="bg-[#1E50D5] hover:bg-[#1a47c4] text-white border-0"
                        >
                            {saving ? 'Moving…' : 'Move'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default InventoryCategories;
