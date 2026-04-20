import React, { useState, useMemo, useCallback } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { InventoryItem } from '../../../types/inventory';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { ICONS, CURRENCY } from '../../../constants';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../utils/apiConnectivity';

import CachedImage from '../../ui/CachedImage';
import Fuse from 'fuse.js';

export type AddOrEditSkuModalMode = 'choice' | 'search' | 'add' | 'edit';

interface AddOrEditSkuModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-fill when adding new (e.g. from POS search - barcode or SKU typed) */
    initialSkuOrBarcode?: string;
    /** When true, open directly in Add New SKU mode (skip choice screen). Pre-fills from `initialSkuOrBarcode` when provided. */
    openInAddMode?: boolean;
    /** When opening in add mode (e.g. Inventory → New SKU), Back closes the modal instead of returning to the search/create choice screen. */
    closeOnBackFromAdd?: boolean;
    /**
     * When set while opening, skip the choice screen and edit this item (e.g. POS catalog right-click → Edit).
     * Parent should resolve from inventory when possible; ref is read when `isOpen` becomes true only.
     */
    initialEditingItem?: InventoryItem | null;
    /** After creating/updating. Use `action` to distinguish create vs update (e.g. POS should not add to cart on update). */
    onItemReady?: (item: InventoryItem, action?: 'created' | 'updated') => void;
}

const defaultForm = {
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category: 'General',
    /** Subcategory row id when applicable; empty string if none */
    subcategoryId: '',
    retailPrice: 0,
    costPrice: 0,
    retailPriceMode: 'fixed' as 'fixed' | 'percentage',
    retailMarkupPercent: 0,
    reorderPoint: 10,
    unit: 'pcs',
    imageUrl: '',
    salesDeactivated: false
};

function deriveCategoryFormFromItem(
    item: InventoryItem,
    cats: ShopProductCategory[]
): { category: string; subcategoryId: string } {
    if (!item.category || item.category === 'General') {
        return { category: 'General', subcategoryId: '' };
    }
    if (item.subcategoryId) {
        return { category: item.category, subcategoryId: item.subcategoryId };
    }
    const byId = new Map(cats.map((c) => [c.id, c]));
    const node = byId.get(item.category);
    if (!node) {
        return { category: 'General', subcategoryId: '' };
    }
    if (node.parent_id) {
        return { category: node.parent_id, subcategoryId: node.id };
    }
    return { category: node.id, subcategoryId: '' };
}

const AddOrEditSkuModal: React.FC<AddOrEditSkuModalProps> = ({
    isOpen,
    onClose,
    initialSkuOrBarcode = '',
    openInAddMode = false,
    closeOnBackFromAdd = false,
    initialEditingItem = null,
    onItemReady
}) => {
    const { items, addItem, updateItem, deleteItem } = useInventory();
    const [mode, setMode] = useState<AddOrEditSkuModalMode>('choice');
    const [existingSearch, setExistingSearch] = useState('');
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [formData, setFormData] = useState(defaultForm);
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const categoryFormInitForItemId = React.useRef<string | null>(null);

    const loadCategories = useCallback(async () => {
        try {
            const list = await getShopCategoriesOfflineFirst();
            setShopCategories(Array.isArray(list) ? list : []);
        } catch {
            setShopCategories([]);
        }
    }, []);

    const initialEditingItemRef = React.useRef<InventoryItem | null>(null);
    initialEditingItemRef.current = initialEditingItem ?? null;

    React.useEffect(() => {
        if (!isOpen) return;
        loadCategories();

        const editItem = initialEditingItemRef.current;
        if (editItem) {
            setMode('edit');
            setExistingSearch('');
            setEditingItem(editItem);
            setSelectedImage(null);
            setImagePreview(editItem.imageUrl || null);
            return;
        }

        const skuOrBarcode = (initialSkuOrBarcode || '').trim();
        const startInAddMode = openInAddMode;
        setMode(startInAddMode ? 'add' : 'choice');
        setExistingSearch('');
        setEditingItem(null);
        setFormData({
            ...defaultForm,
            sku: skuOrBarcode,
            barcode: /^\d+$/.test(skuOrBarcode) ? skuOrBarcode : '',
            name: '',
            description: '',
            category: 'General',
            retailPrice: 0,
            costPrice: 0,
            retailPriceMode: 'fixed',
            retailMarkupPercent: 0,
            reorderPoint: 10,
            unit: 'pcs',
            imageUrl: '',
            subcategoryId: ''
        });
        setSelectedImage(null);
        setImagePreview(null);
    }, [isOpen, initialSkuOrBarcode, openInAddMode, loadCategories]);

    React.useEffect(() => {
        if (editingItem) {
            categoryFormInitForItemId.current = null;
            setFormData({
                sku: editingItem.sku,
                barcode: editingItem.barcode || '',
                name: editingItem.name,
                description: editingItem.description || '',
                category: editingItem.category || 'General',
                subcategoryId: editingItem.subcategoryId || '',
                retailPrice: editingItem.retailPrice ?? 0,
                costPrice: editingItem.costPrice ?? 0,
                retailPriceMode: 'fixed',
                retailMarkupPercent: 0,
                reorderPoint: editingItem.reorderPoint ?? 10,
                unit: editingItem.unit || 'pcs',
                imageUrl: editingItem.imageUrl || '',
                salesDeactivated: editingItem.salesDeactivated === true
            });
            setImagePreview(editingItem.imageUrl || null);
        }
    }, [editingItem]);

    /** After shop categories load, normalize parent/sub dropdowns for edit and legacy rows. */
    React.useEffect(() => {
        if (!editingItem || shopCategories.length === 0) return;
        if (categoryFormInitForItemId.current === editingItem.id) return;
        const derived = deriveCategoryFormFromItem(editingItem, shopCategories);
        setFormData((prev) => ({ ...prev, ...derived }));
        categoryFormInitForItemId.current = editingItem.id;
    }, [editingItem, shopCategories]);

    const fuse = useMemo(
        () =>
            new Fuse(items, {
                keys: ['sku', 'name', 'barcode'],
                threshold: 0.4,
                ignoreLocation: true
            }),
        [items]
    );

    const rootCategories = useMemo(() => {
        return [...shopCategories.filter((c) => !c.parent_id)].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
    }, [shopCategories]);

    const subcategoriesForParent = useMemo(() => {
        if (formData.category === 'General') return [];
        return [...shopCategories.filter((c) => c.parent_id === formData.category)].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
    }, [shopCategories, formData.category]);

    const subcategoryHelperText = (() => {
        if (formData.category === 'General') {
            return 'Choose a main category first. Subcategories for that main category will appear here.';
        }
        if (subcategoriesForParent.length === 0) {
            return 'This main category has no subcategories — classification stops at the main category.';
        }
        return 'Choose a subcategory to finish, or “Main category only” if the product sits under the parent shelf.';
    })();

    const subcategorySelectDisabled =
        formData.category === 'General' || subcategoriesForParent.length === 0;

    React.useEffect(() => {
        if (formData.category !== 'General' && subcategoriesForParent.length === 0 && formData.subcategoryId) {
            setFormData((prev) => ({ ...prev, subcategoryId: '' }));
        }
    }, [formData.category, formData.subcategoryId, subcategoriesForParent.length]);

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

    /**
     * For **new** SKUs, any name/barcode collision blocks save.
     * For **edits**, only block if the user *changed* name or barcode and that new value still collides.
     * Otherwise duplicate rows in inventory (same barcode on two ids) would prevent saving price/image updates.
     */
    const hasBlockingConflict = useMemo(() => {
        if (!editingItem) return hasConflict;
        const nameNorm = formData.name.trim().toLowerCase();
        const origName = (editingItem.name || '').trim().toLowerCase();
        const nameChanged = nameNorm !== origName;

        const bcNorm = (formData.barcode || '').trim().toLowerCase();
        const origBc = (editingItem.barcode || '').trim().toLowerCase();
        const barcodeChanged = bcNorm !== origBc;

        const blockName = nameChanged && nameConflictItems.length > 0;
        const blockBarcode = barcodeChanged && barcodeConflictItems.length > 0;
        return blockName || blockBarcode;
    }, [
        editingItem,
        formData.name,
        formData.barcode,
        hasConflict,
        nameConflictItems.length,
        barcodeConflictItems.length
    ]);

    /** Gross margin on retail: (retail − cost) / retail — used for low-margin warning. */
    const grossMarginPercent = useMemo(() => {
        const retail = Number(formData.retailPrice);
        const cost = Number(formData.costPrice);
        if (!Number.isFinite(retail) || retail <= 0) return null;
        return ((retail - cost) / retail) * 100;
    }, [formData.retailPrice, formData.costPrice]);

    const showLowMarginWarning =
        grossMarginPercent !== null && grossMarginPercent < 5 && Number(formData.retailPrice) > 0;

    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

    const UNIT_OPTIONS: { value: string; label: string }[] = [
        { value: 'pcs', label: 'Piece (pcs)' },
        { value: 'BTL', label: 'Bottle (BTL)' },
        { value: 'kg', label: 'Kilogram (kg)' },
        { value: 'g', label: 'Gram (g)' },
        { value: 'L', label: 'Litre (L)' },
        { value: 'mL', label: 'Millilitre (mL)' },
        { value: 'box', label: 'Box' },
        { value: 'pack', label: 'Pack' },
        { value: 'dozen', label: 'Dozen' }
    ];

    const handleSkuImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_BYTES) {
            alert('Image must be 2MB or smaller. Recommended: 1024×1024px, PNG or JPG.');
            e.target.value = '';
            return;
        }
        setSelectedImage(file);
        setImagePreview(URL.createObjectURL(file));
    }, []);

    const unitInPreset = UNIT_OPTIONS.some((o) => o.value === formData.unit);

    const handleClose = useCallback(() => {
        categoryFormInitForItemId.current = null;
        setMode('choice');
        setEditingItem(null);
        setFormData(defaultForm);
        onClose();
    }, [onClose]);

    const handleFormBack = useCallback(() => {
        if (editingItem) {
            setEditingItem(null);
            setMode('search');
        } else if (closeOnBackFromAdd) {
            handleClose();
        } else {
            setMode('choice');
        }
    }, [editingItem, closeOnBackFromAdd, handleClose]);

    const handleDiscardForm = useCallback(() => {
        if (editingItem) {
            setFormData({
                sku: editingItem.sku,
                barcode: editingItem.barcode || '',
                name: editingItem.name,
                description: editingItem.description || '',
                category: editingItem.category || 'General',
                subcategoryId: editingItem.subcategoryId || '',
                retailPrice: editingItem.retailPrice ?? 0,
                costPrice: editingItem.costPrice ?? 0,
                retailPriceMode: 'fixed',
                retailMarkupPercent: 0,
                reorderPoint: editingItem.reorderPoint ?? 10,
                unit: editingItem.unit || 'pcs',
                imageUrl: editingItem.imageUrl || '',
                salesDeactivated: editingItem.salesDeactivated === true
            });
            setSelectedImage(null);
            setImagePreview(editingItem.imageUrl || null);
        } else {
            const skuOrBarcode = (initialSkuOrBarcode || '').trim();
            setFormData({
                ...defaultForm,
                sku: skuOrBarcode,
                barcode: /^\d+$/.test(skuOrBarcode) ? skuOrBarcode : '',
                retailPriceMode: 'fixed',
                retailMarkupPercent: 0,
                subcategoryId: ''
            });
            setSelectedImage(null);
            setImagePreview(null);
        }
    }, [editingItem, initialSkuOrBarcode]);

    const handleCreateNew = useCallback(async () => {
        if (hasBlockingConflict) return;
        setSaving(true);
        try {
            let imageUrl = formData.imageUrl;
            let imageAlreadyUploaded = false;
            if (selectedImage && typeof navigator !== 'undefined' && navigator.onLine) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = uploadRes.imageUrl || '';
                imageAlreadyUploaded = true;
            }
            const newItem = await addItem(
                {
                    id: '',
                    sku: formData.sku || `SKU-${Date.now()}`,
                    barcode: formData.barcode || undefined,
                    name: formData.name,
                    description: formData.description || undefined,
                    category: formData.category,
                    subcategoryId: formData.subcategoryId || undefined,
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
                imageAlreadyUploaded ? undefined : selectedImage || undefined
            );
            handleClose();
            onItemReady?.(newItem, 'created');
        } catch (e) {
            console.error(e);
            if (isApiConnectivityFailure(e)) {
                alert(userMessageForApiError(e, 'Could not save SKU.'));
            }
        } finally {
            setSaving(false);
        }
    }, [formData, selectedImage, addItem, handleClose, onItemReady, hasBlockingConflict]);

    const handleUpdateExisting = useCallback(async () => {
        if (!editingItem || hasBlockingConflict) return;
        setSaving(true);
        try {
            let imageUrl = formData.imageUrl;
            if (selectedImage) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = uploadRes.imageUrl || '';
            }
            await updateItem(editingItem.id, {
                sku: formData.sku,
                barcode: formData.barcode || undefined,
                name: formData.name,
                description: formData.description || undefined,
                category: formData.category,
                subcategoryId: formData.subcategoryId,
                retailPrice: Number(formData.retailPrice),
                costPrice: Number(formData.costPrice),
                reorderPoint: Number(formData.reorderPoint),
                unit: formData.unit,
                imageUrl,
                salesDeactivated: formData.salesDeactivated
            });
            handleClose();
            const updated = { ...editingItem, ...formData, barcode: formData.barcode || undefined };
            onItemReady?.(updated as InventoryItem, 'updated');
        } catch (e) {
            console.error(e);
            if (isApiConnectivityFailure(e)) {
                alert(userMessageForApiError(e, 'Could not update SKU.'));
            }
        } finally {
            setSaving(false);
        }
    }, [editingItem, formData, selectedImage, updateItem, handleClose, onItemReady, hasBlockingConflict]);

    const handleDeleteSku = useCallback(async () => {
        if (!editingItem || editingItem.id.startsWith('pending-')) return;
        const confirmed = window.confirm(
            `Archive "${editingItem.name}" (SKU: ${editingItem.sku})? This removes it from the catalog. This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await deleteItem(editingItem.id);
            handleClose();
        } catch (e: any) {
            const msg = isApiConnectivityFailure(e)
                ? userMessageForApiError(e, 'Could not delete SKU.')
                : (e?.message ?? e?.error ?? 'This SKU has been used in transactions. Please delete the transactions first if you want to delete the SKU.');
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

    const showSkuForm = mode === 'add' || !!editingItem;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={title}
            size={showSkuForm ? 'lg' : 'xl'}
            maxContentHeight={showSkuForm ? undefined : 720}
            hideHeader={showSkuForm}
            hideClose={showSkuForm}
            disableScroll={showSkuForm}
            className={showSkuForm ? 'max-h-[min(92vh,620px)]' : undefined}
        >
            <div className={showSkuForm ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'space-y-4'}>
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
                                            <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Add barcode</span>
                                        )}
                                        {item.salesDeactivated && (
                                            <span className="text-xs font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">Sales off</span>
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

                {showSkuForm && (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-slate-200 bg-white px-3 pb-2 pt-1.5 sm:px-4">
                            <button
                                type="button"
                                onClick={handleFormBack}
                                className="mb-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-violet-700"
                            >
                                {React.cloneElement(ICONS.chevronLeft as React.ReactElement<any>, { size: 14, className: 'shrink-0' })}
                                {closeOnBackFromAdd ? 'Back to Inventory' : 'Back'}
                            </button>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        {editingItem ? 'Edit SKU' : 'New SKU'}
                                    </p>
                                    <h1 id="modal-title" className="mt-0.5 text-base font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">
                                        {formData.name.trim() || (editingItem?.name ?? 'Untitled product')}
                                    </h1>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                    aria-label="Close"
                                >
                                    {React.cloneElement(ICONS.x as React.ReactElement<any>, { size: 18, strokeWidth: 2 })}
                                </button>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-3 py-2 sm:px-4">
                            {editingItem && (
                                <p className="mb-1.5 shrink-0 rounded border border-slate-100 bg-slate-50/90 px-2 py-1 text-[10px] leading-tight text-slate-600">
                                    Barcodes must be unique. Use <strong className="text-slate-800">Stock Master</strong> for sales-off SKUs.
                                </p>
                            )}
                            {formData.salesDeactivated && (
                                <div
                                    className="mb-1.5 flex shrink-0 flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50/90 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                                    role="status"
                                >
                                    <p className="text-[10px] font-medium text-amber-950">Sales off — hidden from POS / shop.</p>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                                        onClick={() => setFormData({ ...formData, salesDeactivated: false })}
                                    >
                                        Reactivate
                                    </button>
                                </div>
                            )}

                            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-stretch lg:gap-4">
                                {/* Product preview (left) — fixed height to match reference density */}
                                <div className="flex w-full shrink-0 flex-col lg:w-[168px] lg:max-w-[168px]">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Product preview</p>
                                    <div className="mt-1.5 h-20 w-full overflow-hidden rounded-xl bg-sky-100/90 ring-1 ring-sky-200/80 sm:h-[120px]">
                                        {imagePreview ? (
                                            imagePreview.startsWith('blob:') ? (
                                                <img src={imagePreview} alt="" className="h-full w-full object-contain p-1" />
                                            ) : (
                                                <CachedImage path={imagePreview} alt="" className="h-full w-full object-contain p-1" />
                                            )
                                        ) : (
                                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-sky-400/90">
                                                {React.cloneElement(ICONS.image as React.ReactElement<any>, { size: 28, strokeWidth: 1.5 })}
                                                <span className="text-[10px] font-medium text-slate-400">No image</span>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,image/webp,image/*"
                                        onChange={handleSkuImageFile}
                                        className="hidden"
                                        id="add-edit-sku-image"
                                    />
                                    <label
                                        htmlFor="add-edit-sku-image"
                                        className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                        {React.cloneElement(ICONS.upload as React.ReactElement<any>, { size: 14, className: 'text-slate-500' })}
                                        Change image
                                    </label>
                                    <div className="mt-1.5 rounded-lg border border-sky-100 bg-sky-50/80 px-2 py-1 text-[9px] leading-tight text-sky-900/85">
                                        1024×1024px, PNG/JPG, max 2MB.
                                    </div>
                                </div>

                                {/* Fields (right) */}
                                <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-hidden">
                                    <section>
                                        <div className="mb-1.5 flex items-center gap-1.5">
                                            <span className="h-1 w-1 shrink-0 rounded-full bg-violet-600" />
                                            <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                                Product identity
                                            </h2>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="pos-sku-code-input">
                                                        SKU
                                                    </label>
                                                    {!editingItem && (
                                                        <span className="text-[10px] font-medium text-violet-600">Auto if empty</span>
                                                    )}
                                                </div>
                                                <Input
                                                    id="pos-sku-code-input"
                                                    compact
                                                    readOnly={!!editingItem}
                                                    placeholder={editingItem ? '' : 'e.g. BEV-7UP-1500ML'}
                                                    value={formData.sku}
                                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                    className={
                                                        editingItem
                                                            ? 'cursor-not-allowed rounded-md border-slate-200 bg-slate-100 text-slate-700'
                                                            : 'rounded-md border-slate-200 bg-white'
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <Input
                                                    label="Barcode"
                                                    compact
                                                    placeholder="Scan or enter"
                                                    value={formData.barcode}
                                                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                                    helperText={barcodeConflictItems.length === 0 ? 'Unique across products' : undefined}
                                                    className="rounded-md border-slate-200 bg-white"
                                                />
                                                {barcodeConflictItems.length > 0 && (
                                                    <div className="rounded-md border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-900">
                                                        <div className="mb-0.5 flex items-center gap-1 font-semibold">
                                                            {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 10 })}
                                                            Barcode already in use
                                                        </div>
                                                        <ul className="max-h-12 space-y-0.5 overflow-hidden">
                                                            {barcodeConflictItems.map((item) => (
                                                                <li key={item.id} className="flex items-center gap-2">
                                                                    <span className="truncate">{item.name}</span>
                                                                    <span className="shrink-0 text-amber-700">· {item.sku}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 space-y-0.5">
                                            <Input
                                                label="Product name"
                                                compact
                                                placeholder="e.g. 7up 1.5 litre"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                helperText={nameConflictItems.length === 0 ? 'Unique across products' : undefined}
                                                className="rounded-md border-slate-200 bg-white"
                                            />
                                            {nameConflictItems.length > 0 && (
                                                <div className="rounded-md border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-900">
                                                    <div className="mb-0.5 flex items-center gap-1 font-semibold">
                                                        {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 10 })}
                                                        Name already in use
                                                    </div>
                                                    <ul className="max-h-12 space-y-0.5 overflow-hidden">
                                                        {nameConflictItems.map((item) => (
                                                            <li key={item.id} className="truncate">
                                                                {item.name} · {item.sku}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                        <details className="group mt-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1">
                                            <summary className="cursor-pointer text-[10px] font-medium text-slate-600 marker:text-slate-400">
                                                Description (mobile shop)
                                            </summary>
                                            <textarea
                                                placeholder="Optional"
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                rows={2}
                                                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                                            />
                                        </details>
                                    </section>

                                    <div className="flex min-w-0 flex-col gap-4">
                                        <section className="min-w-0">
                                            <div className="mb-1.5 flex items-center gap-1.5">
                                                <span className="h-1 w-1 shrink-0 rounded-full bg-violet-600" />
                                                <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                                    Categorization
                                                </h2>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="space-y-1.5">
                                                    <label
                                                        htmlFor="pos-add-edit-sku-main-category"
                                                        className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                                                    >
                                                        Category
                                                    </label>
                                                    <select
                                                        id="pos-add-edit-sku-main-category"
                                                        className="block w-full rounded-md border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/25"
                                                        value={formData.category}
                                                        onChange={(e) => {
                                                            const next = e.target.value;
                                                            setFormData({
                                                                ...formData,
                                                                category: next,
                                                                subcategoryId: ''
                                                            });
                                                        }}
                                                    >
                                                        <option value="General">General (uncategorized)</option>
                                                        {rootCategories.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label
                                                        htmlFor="pos-add-edit-sku-subcategory"
                                                        className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                                                    >
                                                        Subcategory
                                                    </label>
                                                    <select
                                                        id="pos-add-edit-sku-subcategory"
                                                        aria-describedby="pos-add-edit-sku-subcategory-help"
                                                        disabled={subcategorySelectDisabled}
                                                        className="block w-full rounded-md border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                                        value={formData.subcategoryId}
                                                        onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })}
                                                    >
                                                        <option value="">
                                                            {formData.category === 'General'
                                                                ? 'Select a main category first…'
                                                                : subcategoriesForParent.length === 0
                                                                  ? '— No subcategories'
                                                                  : 'Main category only'}
                                                        </option>
                                                        {subcategoriesForParent.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p
                                                        id="pos-add-edit-sku-subcategory-help"
                                                        className="line-clamp-1 text-[9px] leading-tight text-slate-500"
                                                        title={subcategoryHelperText}
                                                    >
                                                        {subcategoryHelperText}
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label htmlFor="pos-sku-unit" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                        Unit of measure
                                                    </label>
                                                    <select
                                                        id="pos-sku-unit"
                                                        className="block w-full rounded-md border border-slate-200 bg-white py-1.5 px-2 text-xs text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/25"
                                                        value={unitInPreset ? formData.unit : '__custom__'}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            if (v === '__custom__') {
                                                                setFormData({ ...formData, unit: '' });
                                                            } else {
                                                                setFormData({ ...formData, unit: v });
                                                            }
                                                        }}
                                                    >
                                                        {UNIT_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                        <option value="__custom__">Custom…</option>
                                                    </select>
                                                    {!unitInPreset && (
                                                        <input
                                                            id="pos-sku-unit-custom"
                                                            value={formData.unit}
                                                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                                            placeholder="e.g. case (12)"
                                                            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/25"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </section>

                                        <section className="min-w-0">
                                            <div className="mb-1.5 flex items-center gap-1.5">
                                                <span className="h-1 w-1 shrink-0 rounded-full bg-violet-600" />
                                                <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">Financials</h2>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start sm:gap-3">
                                                    <div className="min-w-0">
                                                        <Input
                                                            label={`Cost (${CURRENCY})`}
                                                            compact
                                                            type="number"
                                                            value={formData.costPrice}
                                                            onChange={(e) => {
                                                                const cost = Number(e.target.value);
                                                                const next = { ...formData, costPrice: cost };
                                                                if (formData.retailPriceMode === 'percentage') {
                                                                    next.retailPrice =
                                                                        Math.round(cost * (1 + formData.retailMarkupPercent / 100) * 100) / 100;
                                                                }
                                                                setFormData(next);
                                                            }}
                                                            className="rounded-md border-slate-200 bg-white"
                                                        />
                                                    </div>
                                                    <div className="min-w-0 space-y-1">
                                                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                                Retail ({CURRENCY})
                                                            </span>
                                                            <div
                                                                className="inline-flex w-full shrink-0 rounded-md border border-slate-200 bg-slate-100 p-0.5 sm:w-auto sm:max-w-full"
                                                                role="group"
                                                                aria-label="Retail price mode"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setFormData({ ...formData, retailPriceMode: 'fixed' })}
                                                                    className={`flex-1 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors sm:flex-none ${
                                                                        formData.retailPriceMode === 'fixed'
                                                                            ? 'bg-violet-600 text-white shadow-sm'
                                                                            : 'text-slate-600 hover:bg-white/80'
                                                                    }`}
                                                                >
                                                                    Fixed
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const cost = formData.costPrice;
                                                                        const pct =
                                                                            cost > 0 ? Math.round(((formData.retailPrice - cost) / cost) * 100) : 0;
                                                                        setFormData({
                                                                            ...formData,
                                                                            retailPriceMode: 'percentage',
                                                                            retailMarkupPercent: Math.max(0, pct),
                                                                            retailPrice: cost * (1 + Math.max(0, pct) / 100)
                                                                        });
                                                                    }}
                                                                    className={`flex-1 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors sm:flex-none ${
                                                                        formData.retailPriceMode === 'percentage'
                                                                            ? 'bg-violet-600 text-white shadow-sm'
                                                                            : 'text-slate-600 hover:bg-white/80'
                                                                    }`}
                                                                >
                                                                    Markup
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {formData.retailPriceMode === 'fixed' ? (
                                                            <Input
                                                                compact
                                                                type="number"
                                                                placeholder="0"
                                                                value={formData.retailPrice}
                                                                onChange={(e) => setFormData({ ...formData, retailPrice: Number(e.target.value) })}
                                                                className="rounded-md border-slate-200 bg-white"
                                                            />
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                <div>
                                                                    <div className="flex items-center gap-1">
                                                                        <Input
                                                                            compact
                                                                            type="number"
                                                                            placeholder="0"
                                                                            value={formData.retailMarkupPercent}
                                                                            onChange={(e) => {
                                                                                const pct = Number(e.target.value);
                                                                                const cost = formData.costPrice;
                                                                                const retail =
                                                                                    Math.round(cost * (1 + pct / 100) * 100) / 100;
                                                                                setFormData({
                                                                                    ...formData,
                                                                                    retailMarkupPercent: pct,
                                                                                    retailPrice: retail
                                                                                });
                                                                            }}
                                                                            className="rounded-md border-slate-200 bg-white"
                                                                        />
                                                                        <span className="text-xs text-slate-500">%</span>
                                                                    </div>
                                                                    <p className="mt-0.5 text-[9px] text-slate-500">Markup on cost</p>
                                                                </div>
                                                                <div className="flex flex-col justify-end pb-0.5">
                                                                    <p className="text-[9px] font-bold uppercase text-slate-500">Retail</p>
                                                                    <p className="text-sm font-semibold text-slate-800">
                                                                        {Number(formData.retailPrice).toFixed(2)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <Input
                                                    label="Reorder point"
                                                    compact
                                                    type="number"
                                                    value={formData.reorderPoint}
                                                    onChange={(e) => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                                                    className="rounded-md border-slate-200 bg-white"
                                                />
                                            </div>
                                        </section>
                                    </div>

                                    <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-sky-100 bg-sky-50/80 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={!formData.salesDeactivated}
                                                aria-label="Available for sale"
                                                onClick={() => setFormData({ ...formData, salesDeactivated: !formData.salesDeactivated })}
                                                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 ${
                                                    !formData.salesDeactivated ? 'bg-violet-600' : 'bg-slate-300'
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                                        !formData.salesDeactivated ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                            <span className="text-xs font-medium text-slate-800">Available for sale</span>
                                        </div>
                                        {showLowMarginWarning && (
                                            <span className="inline-flex items-center gap-1 self-start rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 sm:self-center">
                                                {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 12, className: 'shrink-0' })}
                                                Margin {'<'} 5%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-1.5 flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50/95 px-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="order-2 sm:order-1">
                                    {editingItem && !editingItem.id.startsWith('pending-') && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteSku}
                                            disabled={saving || deleting}
                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
                                        >
                                            {React.cloneElement(ICONS.trash as React.ReactElement<any>, { size: 16 })}
                                            {deleting ? 'Archiving…' : 'Archive SKU'}
                                        </button>
                                    )}
                                </div>
                                <div className="order-1 flex flex-wrap items-center justify-end gap-2 sm:order-2 sm:ml-auto">
                                    <button
                                        type="button"
                                        onClick={handleDiscardForm}
                                        disabled={saving || deleting}
                                        className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    {editingItem ? (
                                        <Button
                                            onClick={handleUpdateExisting}
                                            disabled={!formData.name || saving || hasBlockingConflict}
                                            size="sm"
                                            className="min-h-0 rounded-full bg-violet-600 px-5 py-2 text-xs shadow-sm hover:bg-violet-700"
                                        >
                                            {saving ? 'Saving…' : 'Save changes'}
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={handleCreateNew}
                                            disabled={!formData.name || saving || hasBlockingConflict}
                                            size="sm"
                                            className="min-h-0 rounded-full bg-violet-600 px-5 py-2 text-xs shadow-sm hover:bg-violet-700"
                                        >
                                            {saving ? 'Creating…' : 'Create SKU'}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {hasConflict && (
                                <div
                                    className={`mt-1 shrink-0 rounded-lg border p-2 ${hasBlockingConflict ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}
                                >
                                    <div
                                        className={`flex items-center gap-1.5 font-semibold text-[11px] ${hasBlockingConflict ? 'text-rose-800' : 'text-amber-900'}`}
                                    >
                                        {React.cloneElement(ICONS.alertTriangle as React.ReactElement<any>, { size: 14 })}
                                        <span>Name / barcode must be unique</span>
                                    </div>
                                    <p className={`mt-0.5 line-clamp-2 text-[10px] leading-snug ${hasBlockingConflict ? 'text-rose-700' : 'text-amber-800'}`}>
                                        {hasBlockingConflict ? (
                                            <>Change name or barcode to save, or edit the other SKU.</>
                                        ) : (
                                            <>Duplicate name/barcode — adjust to save identity fields.</>
                                        )}
                                    </p>
                                    <ul className="mt-1 max-h-16 overflow-hidden rounded border border-rose-100 bg-white">
                                        {conflictItems.map(({ item, reason }) => (
                                            <li key={item.id} className="flex items-center gap-1.5 border-b border-rose-50 px-1.5 py-0.5 text-[9px] last:border-0">
                                                <div className="h-5 w-5 shrink-0 overflow-hidden rounded bg-slate-100 flex items-center justify-center">
                                                    {item.imageUrl ? (
                                                        <CachedImage path={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                                    ) : (
                                                        React.cloneElement(ICONS.package as React.ReactElement<any>, { size: 12 })
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-slate-800">{item.name}</span>
                                                    <span className="text-slate-500 ml-1">· SKU: {item.sku}</span>
                                                    {item.barcode && (
                                                        <span className="text-slate-500 ml-1">· Barcode: {item.barcode}</span>
                                                    )}
                                                </div>
                                                <span
                                                    className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${hasBlockingConflict ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-900'}`}
                                                >
                                                    Same {reason}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AddOrEditSkuModal;
