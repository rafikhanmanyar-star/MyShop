import React, { useState, useMemo, useCallback } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { InventoryItem } from '../../../types/inventory';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { ICONS } from '../../../constants';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';
import CachedImage from '../../ui/CachedImage';
import Fuse from 'fuse.js';

export type AddOrEditSkuModalMode = 'choice' | 'search' | 'add' | 'edit';

interface AddOrEditSkuModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-fill when adding new (e.g. from POS search - barcode or SKU typed) */
    initialSkuOrBarcode?: string;
    /** After creating/updating, optionally add to cart (POS flow) */
    onItemReady?: (item: InventoryItem) => void;
}

const defaultForm = {
    sku: '',
    barcode: '',
    name: '',
    category: 'General',
    retailPrice: 0,
    costPrice: 0,
    reorderPoint: 10,
    unit: 'pcs',
    imageUrl: ''
};

const AddOrEditSkuModal: React.FC<AddOrEditSkuModalProps> = ({
    isOpen,
    onClose,
    initialSkuOrBarcode = '',
    onItemReady
}) => {
    const { items, addItem, updateItem, deleteItem, refreshItems } = useInventory();
    const [mode, setMode] = useState<AddOrEditSkuModalMode>('choice');
    const [existingSearch, setExistingSearch] = useState('');
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [formData, setFormData] = useState(defaultForm);
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const loadCategories = useCallback(async () => {
        try {
            const list = await getShopCategoriesOfflineFirst();
            setShopCategories(Array.isArray(list) ? list : []);
        } catch {
            setShopCategories([]);
        }
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            loadCategories();
            setMode('choice');
            setExistingSearch('');
            setEditingItem(null);
            const skuOrBarcode = (initialSkuOrBarcode || '').trim();
            setFormData({
                ...defaultForm,
                sku: skuOrBarcode,
                barcode: /^\d+$/.test(skuOrBarcode) ? skuOrBarcode : '',
                name: '',
                category: 'General',
                retailPrice: 0,
                costPrice: 0,
                reorderPoint: 10,
                unit: 'pcs',
                imageUrl: ''
            });
            setSelectedImage(null);
            setImagePreview(null);
        }
    }, [isOpen, initialSkuOrBarcode, loadCategories]);

    React.useEffect(() => {
        if (editingItem) {
            setFormData({
                sku: editingItem.sku,
                barcode: editingItem.barcode || '',
                name: editingItem.name,
                category: editingItem.category || 'General',
                retailPrice: editingItem.retailPrice ?? 0,
                costPrice: editingItem.costPrice ?? 0,
                reorderPoint: editingItem.reorderPoint ?? 10,
                unit: editingItem.unit || 'pcs',
                imageUrl: editingItem.imageUrl || ''
            });
            setImagePreview(editingItem.imageUrl || null);
        }
    }, [editingItem]);

    const fuse = useMemo(
        () =>
            new Fuse(items, {
                keys: ['sku', 'name', 'barcode'],
                threshold: 0.4,
                ignoreLocation: true
            }),
        [items]
    );

    const existingResults = useMemo(() => {
        const q = existingSearch.trim().toLowerCase();
        if (!q) return items.slice(0, 20);
        const searched = fuse.search(q);
        return searched.map((r) => r.item).slice(0, 20);
    }, [items, existingSearch, fuse]);

    /** Products that already use this barcode (excluding the one we're editing). */
    const barcodeConflictItems = useMemo(() => {
        const barcodeNorm = formData.barcode.trim().toLowerCase();
        const currentId = editingItem?.id ?? '';
        if (!barcodeNorm) return [];
        return items.filter(
            (i) =>
                i.id !== currentId &&
                i.barcode &&
                i.barcode.trim().toLowerCase() === barcodeNorm
        );
    }, [items, formData.barcode, editingItem?.id]);

    /** Products that already use this name (excluding the one we're editing). */
    const nameConflictItems = useMemo(() => {
        const nameNorm = formData.name.trim().toLowerCase();
        const currentId = editingItem?.id ?? '';
        if (!nameNorm) return [];
        return items.filter(
            (i) => i.id !== currentId && i.name.trim().toLowerCase() === nameNorm
        );
    }, [items, formData.name, editingItem?.id]);

    /** Combined for submit prevention and legacy conflict block. */
    const conflictItems = useMemo(() => {
        const out: { item: InventoryItem; reason: 'name' | 'barcode' }[] = [];
        const seen = new Set<string>();
        nameConflictItems.forEach((i) => {
            if (!seen.has(i.id)) {
                seen.add(i.id);
                out.push({ item: i, reason: 'name' });
            }
        });
        barcodeConflictItems.forEach((i) => {
            if (!seen.has(i.id)) {
                seen.add(i.id);
                out.push({ item: i, reason: 'barcode' });
            }
        });
        return out;
    }, [nameConflictItems, barcodeConflictItems]);

    const hasConflict = conflictItems.length > 0;

    const handleClose = useCallback(() => {
        setMode('choice');
        setEditingItem(null);
        setFormData(defaultForm);
        onClose();
    }, [onClose]);

    const handleCreateNew = useCallback(async () => {
        if (hasConflict) return;
        setSaving(true);
        try {
            let imageUrl = formData.imageUrl;
            if (selectedImage && typeof navigator !== 'undefined' && navigator.onLine) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = getFullImageUrl(uploadRes.imageUrl) || '';
            }
            const newItem = await addItem(
                {
                    id: '',
                    sku: formData.sku || `SKU-${Date.now()}`,
                    barcode: formData.barcode || undefined,
                    name: formData.name,
                    category: formData.category,
                    retailPrice: Number(formData.retailPrice),
                    costPrice: Number(formData.costPrice),
                    onHand: 0,
                    available: 0,
                    reserved: 0,
                    inTransit: 0,
                    damaged: 0,
                    reorderPoint: Number(formData.reorderPoint),
                    unit: formData.unit,
                    imageUrl,
                    warehouseStock: {}
                },
                selectedImage || undefined
            );
            await refreshItems();
            handleClose();
            onItemReady?.(newItem);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }, [formData, selectedImage, addItem, refreshItems, handleClose, onItemReady, hasConflict]);

    const handleUpdateExisting = useCallback(async () => {
        if (!editingItem || hasConflict) return;
        setSaving(true);
        try {
            let imageUrl = formData.imageUrl;
            if (selectedImage) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = getFullImageUrl(uploadRes.imageUrl) || '';
            }
            await updateItem(editingItem.id, {
                sku: formData.sku,
                barcode: formData.barcode || undefined,
                name: formData.name,
                category: formData.category,
                retailPrice: Number(formData.retailPrice),
                costPrice: Number(formData.costPrice),
                reorderPoint: Number(formData.reorderPoint),
                unit: formData.unit,
                imageUrl
            });
            await refreshItems();
            handleClose();
            const updated = { ...editingItem, ...formData, barcode: formData.barcode || undefined };
            onItemReady?.(updated as InventoryItem);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }, [editingItem, formData, selectedImage, updateItem, refreshItems, handleClose, onItemReady, hasConflict]);

    const handleDeleteSku = useCallback(async () => {
        if (!editingItem || editingItem.id.startsWith('pending-')) return;
        const confirmed = window.confirm(
            `Are you sure you want to delete "${editingItem.name}" (SKU: ${editingItem.sku})? This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await deleteItem(editingItem.id);
            handleClose();
        } catch (e: any) {
            const msg = e?.message ?? e?.error ?? 'This SKU could not be deleted.';
            alert(msg);
        } finally {
            setDeleting(false);
        }
    }, [editingItem, deleteItem, handleClose]);

    const title =
        mode === 'choice'
            ? 'Add or Edit SKU'
            : mode === 'search'
              ? 'Search Existing SKU'
              : mode === 'add'
                ? 'Add New SKU'
                : 'Edit SKU (e.g. add barcode)';

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={title} size="lg">
            <div className="space-y-4">
                {mode === 'choice' && (
                    <>
                        <p className="text-sm text-slate-600">
                            Product not found. You can search for an existing SKU to edit (e.g. add barcode) or create a new one.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setMode('search')}
                                className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left"
                            >
                                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                                    {React.cloneElement(ICONS.search as React.ReactElement<any>, { size: 24 })}
                                </div>
                                <div>
                                    <span className="font-bold text-slate-800 block">Search existing SKU</span>
                                    <span className="text-xs text-slate-500">Find and edit (e.g. add missing barcode)</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('add')}
                                className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left"
                            >
                                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                                    {React.cloneElement(ICONS.plus as React.ReactElement<any>, { size: 24 })}
                                </div>
                                <div>
                                    <span className="font-bold text-slate-800 block">Add new SKU</span>
                                    <span className="text-xs text-slate-500">Create a new product in inventory</span>
                                </div>
                            </button>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                        </div>
                    </>
                )}

                {mode === 'search' && !editingItem && (
                    <>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                                {React.cloneElement(ICONS.search as React.ReactElement<any>, { size: 18 })}
                            </div>
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search by SKU, name, or barcode..."
                                value={existingSearch}
                                onChange={(e) => setExistingSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                            {existingResults.length === 0 ? (
                                <div className="p-6 text-center text-slate-500 text-sm">No SKUs found. Try a different search or add a new one.</div>
                            ) : (
                                existingResults.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setEditingItem(item)}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                                            {item.imageUrl ? (
                                                <CachedImage path={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 20 })
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-slate-800 truncate">{item.name}</div>
                                            <div className="text-xs text-slate-500">
                                                SKU: {item.sku}
                                                {item.barcode ? ` · Barcode: ${item.barcode}` : ' · No barcode'}
                                            </div>
                                        </div>
                                        {!item.barcode && (
                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Add barcode</span>
                                        )}
                                        {React.cloneElement(ICONS.chevronRight as React.ReactElement<any>, { size: 16, className: 'text-slate-400 flex-shrink-0' })}
                                    </button>
                                ))
                            )}
                        </div>
                        <div className="flex justify-between">
                            <Button variant="secondary" onClick={() => setMode('choice')}>Back</Button>
                            <Button variant="secondary" onClick={() => { setEditingItem(null); setMode('add'); }}>Add new SKU instead</Button>
                        </div>
                    </>
                )}

                {(mode === 'add' || editingItem) && (
                    <>
                        {editingItem && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Editing <strong>{editingItem.name}</strong>. Add or update the barcode so it can be scanned at POS.
                            </p>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="SKU Code"
                                placeholder="e.g. SKU-001"
                                value={formData.sku}
                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                            />
                            <div className="space-y-1">
                                <Input
                                    label="Barcode"
                                    placeholder="Scan or enter barcode"
                                    value={formData.barcode}
                                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                    helperText={barcodeConflictItems.length === 0 ? 'Must be unique across all products.' : undefined}
                                />
                                {barcodeConflictItems.length > 0 && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm">
                                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                                            {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 14 })}
                                            <span>Barcode already in use</span>
                                        </div>
                                        <ul className="space-y-1 max-h-24 overflow-y-auto">
                                            {barcodeConflictItems.map((item) => (
                                                <li key={item.id} className="flex items-center gap-2 text-amber-800">
                                                    <div className="w-6 h-6 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                                                        {item.imageUrl ? (
                                                            <CachedImage path={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 12, className: 'm-1' })
                                                        )}
                                                    </div>
                                                    <span className="font-medium truncate">{item.name}</span>
                                                    <span className="text-amber-600 text-xs flex-shrink-0">SKU: {item.sku}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Input
                                label="Product Name"
                                placeholder="e.g. Cotton T-Shirt"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                helperText={nameConflictItems.length === 0 ? 'Must be unique across all products.' : undefined}
                            />
                            {nameConflictItems.length > 0 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm">
                                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                                        {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 14 })}
                                        <span>Product name already in use</span>
                                    </div>
                                    <ul className="space-y-1 max-h-24 overflow-y-auto">
                                        {nameConflictItems.map((item) => (
                                            <li key={item.id} className="flex items-center gap-2 text-amber-800">
                                                <div className="w-6 h-6 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                                                    {item.imageUrl ? (
                                                        <CachedImage path={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 12, className: 'm-1' })
                                                    )}
                                                </div>
                                                <span className="font-medium truncate">{item.name}</span>
                                                <span className="text-amber-600 text-xs flex-shrink-0">SKU: {item.sku}</span>
                                                {item.barcode && (
                                                    <span className="text-amber-600 text-xs flex-shrink-0">· {item.barcode}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                                <select
                                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option value="General">General</option>
                                    {shopCategories.map((c) => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Input
                                label="Unit"
                                value={formData.unit}
                                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                            />
                            <Input
                                label="Reorder Point"
                                type="number"
                                value={formData.reorderPoint}
                                onChange={(e) => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Cost Price"
                                type="number"
                                value={formData.costPrice}
                                onChange={(e) => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                            />
                            <Input
                                label="Retail Price"
                                type="number"
                                value={formData.retailPrice}
                                onChange={(e) => setFormData({ ...formData, retailPrice: Number(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Product Image</label>
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden text-slate-300">
                                    {imagePreview ? (
                                        imagePreview.startsWith('blob:') ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <CachedImage path={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        )
                                    ) : (
                                        React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 32 })
                                    )}
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setSelectedImage(file);
                                                setImagePreview(URL.createObjectURL(file));
                                            }
                                        }}
                                        className="hidden"
                                        id="add-edit-sku-image"
                                    />
                                    <label
                                        htmlFor="add-edit-sku-image"
                                        className="inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                    >
                                        {imagePreview ? 'Change Image' : 'Upload Image'}
                                    </label>
                                </div>
                            </div>
                        </div>

                        {hasConflict && (
                            <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 space-y-2">
                                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                                    {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 18 })}
                                    <span>Name and barcode must be unique</span>
                                </div>
                                <p className="text-xs text-rose-700">
                                    The following SKU(s) already use this name or barcode. Use a different name or barcode, or edit the existing item instead.
                                </p>
                                <ul className="max-h-40 overflow-y-auto border border-rose-200 rounded-lg bg-white divide-y divide-rose-100">
                                    {conflictItems.map(({ item, reason }) => (
                                        <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {item.imageUrl ? (
                                                    <CachedImage path={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 16 })
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="font-semibold text-slate-800">{item.name}</span>
                                                <span className="text-slate-500 ml-1">· SKU: {item.sku}</span>
                                                {item.barcode && (
                                                    <span className="text-slate-500 ml-1">· Barcode: {item.barcode}</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 text-rose-800 flex-shrink-0">
                                                Same {reason}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            {editingItem && !editingItem.id.startsWith('pending-') && (
                                <div className="flex-1 flex justify-start">
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={handleDeleteSku}
                                        disabled={saving || deleting}
                                    >
                                        {deleting ? 'Deleting...' : 'Delete SKU'}
                                    </Button>
                                </div>
                            )}
                            <div className="flex gap-3 justify-end flex-1">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    if (editingItem) {
                                        setEditingItem(null);
                                        setMode('search');
                                    } else {
                                        setMode('choice');
                                    }
                                }}
                            >
                                Back
                            </Button>
                            {editingItem ? (
                                <Button onClick={handleUpdateExisting} disabled={!formData.name || saving || hasConflict}>
                                    {saving ? 'Saving...' : 'Save changes'}
                                </Button>
                            ) : (
                                <Button onClick={handleCreateNew} disabled={!formData.name || saving || hasConflict}>
                                    {saving ? 'Creating...' : 'Create product'}
                                </Button>
                            )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default AddOrEditSkuModal;
