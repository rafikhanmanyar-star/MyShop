import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { createCategoryOfflineFirst } from '../../../services/categorySyncService';
import { ICONS } from '../../../constants';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';

type CategoryKind = 'main' | 'sub';

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

    const mainCategories = useMemo(
        () =>
            [...categories]
                .filter((c) => !c.parent_id)
                .sort((a, b) => a.name.localeCompare(b.name)),
        [categories]
    );

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

    const openAdd = () => {
        setEditingId(null);
        setFormName('');
        setCategoryKind('main');
        setParentId('');
        setIsModalOpen(true);
    };

    const openEdit = (cat: ShopProductCategory) => {
        setEditingId(cat.id);
        setFormName(cat.name);
        const isSub = Boolean(cat.parent_id);
        setCategoryKind(isSub ? 'sub' : 'main');
        setParentId(isSub && cat.parent_id ? cat.parent_id : '');
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        const name = formName.trim();
        if (!name) return;
        if (categoryKind === 'sub' && !parentId) return;
        const resolvedParentId = categoryKind === 'sub' ? parentId : null;
        setSaving(true);
        try {
            if (editingId) {
                await shopApi.updateShopCategory(editingId, { name, parentId: resolvedParentId });
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
        if (!window.confirm('Remove this category? Products using it will have their category cleared.')) return;
        try {
            await shopApi.deleteShopCategory(id);
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete category');
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Product Categories</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Manage categories used when creating SKUs.</p>
                </div>
                <Button onClick={openAdd}>{ICONS.plus} Add Category</Button>
            </div>
            <div className="p-6">
                {loading && <p className="text-slate-500 text-sm">Loading...</p>}
                {error && <p className="text-rose-600 text-sm mb-3">{error}</p>}
                {!loading && categories.length === 0 && !error && (
                    <p className="text-slate-500 text-sm">No categories yet. Add one to use in product creation.</p>
                )}
                {!loading && categories.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {categories.map(cat => {
                            const parentName = cat.parent_id
                                ? categories.find((c) => c.id === cat.parent_id)?.name
                                : null;
                            return (
                            <li key={cat.id} className="py-3 flex items-center justify-between gap-4">
                                <span className="font-medium text-slate-800">
                                    {cat.name}
                                    {parentName != null && (
                                        <span className="text-slate-500 font-normal text-sm ml-2">
                                            (under {parentName})
                                        </span>
                                    )}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openEdit(cat)}
                                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(cat.id)}
                                        className="text-sm text-rose-600 hover:text-rose-800 font-medium"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                            );
                        })}
                    </ul>
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
                        <div className="block text-sm font-medium text-slate-700 mb-2">Category type</div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
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
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
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
                                <p className="text-xs text-amber-700">
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
