import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { createCategoryOfflineFirst } from '../../../services/categorySyncService';
import { getBaseUrl } from '../../../config/apiUrl';
import { ICONS } from '../../../constants';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';

type CategoryKind = 'main' | 'sub';

interface CategoryTree {
    category: ShopProductCategory;
    children: ShopProductCategory[];
}

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

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedIds(new Set(mainCategories.filter((m) => {
            return categories.some((c) => c.parent_id === m.id);
        }).map((m) => m.id)));
    };

    const collapseAll = () => setExpandedIds(new Set());

    const allExpanded = useMemo(() => {
        const withChildren = mainCategories.filter((m) =>
            categories.some((c) => c.parent_id === m.id)
        );
        return withChildren.length > 0 && withChildren.every((m) => expandedIds.has(m.id));
    }, [mainCategories, categories, expandedIds]);

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
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete category');
        }
    };

    const totalSubs = categories.filter((c) => c.parent_id).length;

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="flex-shrink-0 p-6 border-b border-border flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Product Categories</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Manage categories and subcategories used when creating SKUs. Upload a square icon when editing a category to show it in the mobile app category list.
                    </p>
                </div>
                <Button onClick={() => openAdd()}>{ICONS.plus} Add Category</Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain">
                {loading && <p className="text-muted-foreground text-sm">Loading...</p>}
                {error && <p className="text-rose-600 dark:text-rose-400 text-sm mb-3">{error}</p>}
                {!loading && categories.length === 0 && !error && (
                    <p className="text-muted-foreground text-sm">No categories yet. Add one to use in product creation.</p>
                )}
                {!loading && categories.length > 0 && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-muted-foreground">
                                {mainCategories.length} {mainCategories.length === 1 ? 'category' : 'categories'}
                                {totalSubs > 0 && (
                                    <span> · {totalSubs} {totalSubs === 1 ? 'subcategory' : 'subcategories'}</span>
                                )}
                            </p>
                            {totalSubs > 0 && (
                                <button
                                    type="button"
                                    onClick={allExpanded ? collapseAll : expandAll}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                                >
                                    {allExpanded ? 'Collapse all' : 'Expand all'}
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-border">
                            {categoryTree.map(({ category: main, children: subs }) => {
                                const hasSubs = subs.length > 0;
                                const isExpanded = expandedIds.has(main.id);
                                return (
                                    <div key={main.id}>
                                        <div className="py-3 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {hasSubs ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(main.id)}
                                                        aria-label={isExpanded ? 'Collapse subcategories' : 'Expand subcategories'}
                                                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors flex-shrink-0"
                                                    >
                                                        <svg
                                                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={2.5}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </button>
                                                ) : (
                                                    <span className="w-5 flex-shrink-0" />
                                                )}
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="flex-shrink-0 w-9 h-9 rounded-lg border border-border bg-muted/50 overflow-hidden flex items-center justify-center text-xs text-muted-foreground"
                                                        title="Mobile app icon"
                                                    >
                                                        {main.mobile_icon_url ? (
                                                            <img
                                                                src={resolveIconPreviewUrl(main.mobile_icon_url) ?? undefined}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </span>
                                                    <span className="font-medium text-foreground truncate">{main.name}</span>
                                                </span>
                                                {hasSubs && (
                                                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                                                        {subs.length}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openAdd(main.id)}
                                                    className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
                                                    title="Add subcategory"
                                                >
                                                    + Sub
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(main)}
                                                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(main.id)}
                                                    className="text-sm text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                        {hasSubs && isExpanded && (
                                            <div className="ml-7 border-l-2 border-border">
                                                {subs.map((sub) => (
                                                    <div
                                                        key={sub.id}
                                                        className="py-2.5 pl-4 flex items-center justify-between gap-4"
                                                    >
                                                        <span className="text-sm text-muted-foreground">{sub.name}</span>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEdit(sub)}
                                                                className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(sub.id)}
                                                                className="text-sm text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

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
                        <div className="block text-sm font-medium text-foreground mb-2">Category type</div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
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
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
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
                            <div className="block text-sm font-medium text-foreground">Mobile app icon</div>
                            <p className="text-xs text-muted-foreground">
                                JPEG, PNG, or WebP — resized to 256×256 for the customer app. Optional for subcategories.
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="w-16 h-16 rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
                                    {formMobileIconUrl ? (
                                        <img
                                            src={resolveIconPreviewUrl(formMobileIconUrl) || undefined}
                                            alt=""
                                            className="w-full h-full object-cover"
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
                                            className="text-xs text-rose-600 hover:underline text-left"
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
                                    Add at least one main category first, then you can create subcategories under it.
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!canSubmit}>
                            {saving ? 'Saving...' : (editingId ? 'Update' : 'Add')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default InventoryCategories;
