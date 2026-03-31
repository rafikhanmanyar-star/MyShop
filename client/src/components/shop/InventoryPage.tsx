import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import InventoryDashboard from './inventory/InventoryDashboard';
import StockMaster from './inventory/StockMaster';
import StockMovements from './inventory/StockMovements';
import StockAdjustments from './inventory/StockAdjustments';
import InventoryCategories from './inventory/InventoryCategories';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { shopApi, ShopProductCategory } from '../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../services/categoriesOfflineCache';
import { createCategoryOfflineFirst } from '../../services/categorySyncService';
import { getFullImageUrl } from '../../config/apiUrl';
const InventoryContent: React.FC = () => {
    const { items, addItem, refreshItems } = useInventory();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'movements' | 'adjustments' | 'categories'>('dashboard');
    const [isNewSkuModalOpen, setIsNewSkuModalOpen] = useState(false);
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [newItemData, setNewItemData] = useState({
        sku: '',
        barcode: '',
        name: '',
        category: 'General',
        retailPrice: 0,
        costPrice: 0,
        reorderPoint: 10,
        unit: 'pcs',
        imageUrl: ''
    });
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [categorySearchQuery, setCategorySearchQuery] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);
    const categoryInputRef = useRef<HTMLDivElement>(null);
    const categoryDropdownPortalRef = useRef<HTMLDivElement>(null);
    const [categoryDropdownPos, setCategoryDropdownPos] = useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);

    const loadShopCategories = useCallback(async () => {
        try {
            const list = await getShopCategoriesOfflineFirst();
            setShopCategories(Array.isArray(list) ? list : []);
        } catch {
            setShopCategories([]);
        }
    }, []);

    // Refresh items and shop categories when component mounts
    useEffect(() => {
        refreshItems();
        loadShopCategories();
    }, [refreshItems, loadShopCategories]);

    // When modal opens, refresh categories and sync search state (deps: modal open only)
    useEffect(() => {
        if (!isNewSkuModalOpen) return;
        loadShopCategories();
        setCategorySearchQuery(newItemData.category);
        setCategoryDropdownOpen(false);
    }, [isNewSkuModalOpen, loadShopCategories]);

    /** Close category picker when clicking outside the field and the portaled list */
    useEffect(() => {
        if (!categoryDropdownOpen) return;
        const handle = (e: PointerEvent) => {
            const t = e.target as Node;
            if (categoryInputRef.current?.contains(t)) return;
            if (categoryDropdownPortalRef.current?.contains(t)) return;
            setCategoryDropdownOpen(false);
        };
        document.addEventListener('pointerdown', handle, true);
        return () => document.removeEventListener('pointerdown', handle, true);
    }, [categoryDropdownOpen]);

    /** Main and sub categories with a display label (Parent › Sub) for the picker. */
    const categoryPickerRows = useMemo(() => {
        const byId = new Map(shopCategories.map((c) => [c.id, c]));
        return shopCategories.map((c) => {
            const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
            const label = parent ? `${parent.name} › ${c.name}` : c.name;
            return { id: c.id, name: c.name, label };
        });
    }, [shopCategories]);

    const allCategoryNames = useCallback(() => {
        const names = new Set<string>(['General']);
        categoryPickerRows.forEach((r) => names.add(r.name));
        return Array.from(names);
    }, [categoryPickerRows]);

    const filteredCategoryPickerRows = React.useMemo(() => {
        const q = (categorySearchQuery || '').trim().toLowerCase();
        const all = categoryPickerRows;
        const list =
            !q
                ? all
                : all.filter(
                      (r) =>
                          r.label.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
                  );
        return [...list].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }, [categorySearchQuery, categoryPickerRows]);

    // Fixed-position portal so the list is not clipped by the modal body (overflow-y-auto)
    useLayoutEffect(() => {
        if (!categoryDropdownOpen || !categoryInputRef.current) {
            setCategoryDropdownPos(null);
            return;
        }
        const update = () => {
            const el = categoryInputRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setCategoryDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [categoryDropdownOpen, categorySearchQuery, filteredCategoryPickerRows]);

    const showGeneralInList = useMemo(() => {
        const q = (categorySearchQuery || '').trim().toLowerCase();
        if (!q) return true;
        return 'general'.includes(q);
    }, [categorySearchQuery]);

    const trimmedQuery = (categorySearchQuery || '').trim();
    const exactMatch = trimmedQuery && allCategoryNames().some((n) => n.toLowerCase() === trimmedQuery.toLowerCase());
    const showAddOption = trimmedQuery.length > 0 && !exactMatch;

    const handleSelectCategory = (name: string) => {
        setNewItemData((prev) => ({ ...prev, category: name }));
        setCategorySearchQuery(name);
        setCategoryDropdownOpen(false);
    };

    const handleAddCategoryOnTheFly = async () => {
        if (!trimmedQuery || addingCategory) return;
        setAddingCategory(true);
        try {
            await createCategoryOfflineFirst(trimmedQuery);
            await loadShopCategories();
            setNewItemData((prev) => ({ ...prev, category: trimmedQuery }));
            setCategorySearchQuery(trimmedQuery);
            setCategoryDropdownOpen(false);
        } catch (err) {
            console.error('Failed to create category:', err);
        } finally {
            setAddingCategory(false);
        }
    };

    // Real-time duplicate checks for barcode and product name
    const barcodeConflictItems = React.useMemo(() => {
        const barcodeNorm = (newItemData.barcode || '').trim().toLowerCase();
        if (!barcodeNorm) return [];
        return items.filter(
            (i) => i.barcode && i.barcode.trim().toLowerCase() === barcodeNorm
        );
    }, [items, newItemData.barcode]);

    const nameConflictItems = React.useMemo(() => {
        const nameNorm = (newItemData.name || '').trim().toLowerCase();
        if (!nameNorm) return [];
        return items.filter(
            (i) => i.name.trim().toLowerCase() === nameNorm
        );
    }, [items, newItemData.name]);

    const hasConflict = barcodeConflictItems.length > 0 || nameConflictItems.length > 0;

    const handleCreateSku = async () => {
        if (hasConflict) return;
        try {
            let imageUrl = '';
            if (selectedImage && typeof navigator !== 'undefined' && navigator.onLine) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = getFullImageUrl(uploadRes.imageUrl) || '';
            }

            await addItem(
                {
                    id: '', // Will be generated
                    sku: newItemData.sku || `SKU-${Date.now()}`,
                    barcode: newItemData.barcode || undefined,
                    name: newItemData.name,
                    category: newItemData.category,
                    retailPrice: Number(newItemData.retailPrice),
                    costPrice: Number(newItemData.costPrice),
                    onHand: 0,
                    available: 0,
                    reserved: 0,
                    inTransit: 0,
                    damaged: 0,
                    reorderPoint: Number(newItemData.reorderPoint),
                    unit: newItemData.unit,
                    imageUrl,
                    warehouseStock: {}
                },
                selectedImage || undefined
            );
            setIsNewSkuModalOpen(false);
            setNewItemData({
                sku: '',
                barcode: '',
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
        } catch (error) {
            // Error already handled in addItem
            console.error('Failed to create SKU:', error);
        }
    };

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: ICONS.barChart },
        { id: 'stock', label: 'Stock Master', icon: ICONS.package },
        { id: 'movements', label: 'Movements', icon: ICONS.trendingUp },
        { id: 'adjustments', label: 'Adjustments', icon: ICONS.settings },
        { id: 'categories', label: 'Categories', icon: ICONS.folder },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-foreground dark:text-slate-200 tracking-tight">Inventory Management</h1>
                        <p className="text-muted-foreground dark:text-muted-foreground text-sm font-medium">Enterprise-level stock control and logistics.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsNewSkuModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                            {ICONS.plus} New SKU
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-muted-foreground dark:text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content area: flex so Stock Master / Dashboard / Movements can fill and scroll internally; other tabs can scroll here */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-8">
                <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${['stock', 'dashboard', 'movements', 'categories'].includes(activeTab) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {activeTab === 'dashboard' && <div className="flex-1 min-h-0 flex flex-col"><InventoryDashboard /></div>}
                    {activeTab === 'stock' && <div className="flex-1 min-h-0 flex flex-col"><StockMaster /></div>}
                    {activeTab === 'movements' && <div className="flex-1 min-h-0 flex flex-col"><StockMovements /></div>}
                    {activeTab === 'adjustments' && <StockAdjustments />}
                    {activeTab === 'categories' && (
                        <div className="flex-1 min-h-0 flex flex-col min-w-0">
                            <InventoryCategories />
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={isNewSkuModalOpen}
                onClose={() => setIsNewSkuModalOpen(false)}
                title="Create New SKU"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="SKU Code"
                            placeholder="Auto-generated if empty"
                            value={newItemData.sku}
                            onChange={(e) => setNewItemData({ ...newItemData, sku: e.target.value })}
                        />
                        <div className="space-y-1">
                            <Input
                                label="Barcode"
                                placeholder="Scan or enter barcode"
                                value={newItemData.barcode}
                                onChange={(e) => setNewItemData({ ...newItemData, barcode: e.target.value })}
                            />
                            {barcodeConflictItems.length > 0 && (
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-2.5 text-sm">
                                <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200 mb-1">
                                        {React.cloneElement(ICONS.alertTriangle as React.ReactElement<{ size?: number }>, { size: 14 })}
                                        <span>Barcode already in use</span>
                                    </div>
                                    <ul className="space-y-1 max-h-24 overflow-y-auto">
                                        {barcodeConflictItems.map((item) => (
                                            <li key={item.id} className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                                                <div className="w-6 h-6 rounded bg-muted dark:bg-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        React.cloneElement(ICONS.package as React.ReactElement<{ size?: number }>, { size: 12 })
                                                    )}
                                                </div>
                                                <span className="font-medium truncate">{item.name}</span>
                                                <span className="text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">SKU: {item.sku}</span>
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
                            value={newItemData.name}
                            onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                        />
                        {nameConflictItems.length > 0 && (
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-2.5 text-sm">
                                <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200 mb-1">
                                    {React.cloneElement(ICONS.alertTriangle as React.ReactElement<{ size?: number }>, { size: 14 })}
                                    <span>Product name already in use</span>
                                </div>
                                <ul className="space-y-1 max-h-24 overflow-y-auto">
                                    {nameConflictItems.map((item) => (
                                        <li key={item.id} className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                                            <div className="w-6 h-6 rounded bg-muted dark:bg-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    React.cloneElement(ICONS.package as React.ReactElement<{ size?: number }>, { size: 12 })
                                                )}
                                            </div>
                                            <span className="font-medium truncate">{item.name}</span>
                                            <span className="text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">SKU: {item.sku}</span>
                                            {item.barcode && (
                                                <span className="text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">· {item.barcode}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div ref={categoryInputRef} className="relative">
                            <label className="block text-sm font-medium text-foreground dark:text-slate-300 mb-1">Category</label>
                            <input
                                type="text"
                                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-card dark:bg-slate-800 dark:text-slate-100 py-2 px-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                placeholder="Search or add category..."
                                value={categoryDropdownOpen ? categorySearchQuery : newItemData.category}
                                onChange={(e) => {
                                    setCategorySearchQuery(e.target.value);
                                    setCategoryDropdownOpen(true);
                                }}
                                onFocus={() => {
                                    setCategorySearchQuery(newItemData.category);
                                    setCategoryDropdownOpen(true);
                                }}
                            />
                            {categoryDropdownOpen &&
                                categoryDropdownPos &&
                                createPortal(
                                    <div
                                        ref={categoryDropdownPortalRef}
                                        className="rounded-lg border border-border dark:border-slate-700 bg-card dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-y-auto"
                                        style={{
                                            position: 'fixed',
                                            top: categoryDropdownPos.top,
                                            left: categoryDropdownPos.left,
                                            width: categoryDropdownPos.width,
                                            zIndex: 10050
                                        }}
                                    >
                                        {filteredCategoryPickerRows.length === 0 &&
                                            !showAddOption &&
                                            !showGeneralInList && (
                                                <div className="px-3 py-2 text-sm text-muted-foreground dark:text-muted-foreground">
                                                    No categories match.
                                                </div>
                                            )}
                                        {showGeneralInList && (
                                            <button
                                                type="button"
                                                className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-foreground dark:text-slate-200"
                                                onClick={() => handleSelectCategory('General')}
                                            >
                                                General
                                            </button>
                                        )}
                                        {filteredCategoryPickerRows.map((row) => (
                                            <button
                                                key={row.id}
                                                type="button"
                                                className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-foreground dark:text-slate-200"
                                                onClick={() => handleSelectCategory(row.name)}
                                            >
                                                {row.label}
                                            </button>
                                        ))}
                                        {showAddOption && (
                                            <button
                                                type="button"
                                                className="block w-full text-left px-3 py-2 text-sm bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium border-t border-border dark:border-slate-700"
                                                onClick={handleAddCategoryOnTheFly}
                                                disabled={addingCategory}
                                            >
                                                {addingCategory ? 'Adding…' : `Add "${trimmedQuery}" as new category`}
                                            </button>
                                        )}
                                    </div>,
                                    document.body
                                )}
                        </div>
                        <Input
                            label="Unit"
                            placeholder="pcs, kg, etc"
                            value={newItemData.unit}
                            onChange={(e) => setNewItemData({ ...newItemData, unit: e.target.value })}
                        />
                        <Input
                            label="Reorder Point"
                            type="number"
                            value={newItemData.reorderPoint}
                            onChange={(e) => setNewItemData({ ...newItemData, reorderPoint: Number(e.target.value) })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cost Price"
                            type="number"
                            value={newItemData.costPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, costPrice: Number(e.target.value) })}
                        />
                        <Input
                            label="Retail Price"
                            type="number"
                            value={newItemData.retailPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, retailPrice: Number(e.target.value) })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground dark:text-slate-300">Product Image</label>
                        <div className="flex items-center gap-4">
                            <div className="w-24 h-24 rounded-2xl bg-muted dark:bg-slate-700 border-2 border-dashed border-border dark:border-slate-600 flex items-center justify-center overflow-hidden text-slate-300 dark:text-muted-foreground">
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    React.cloneElement(ICONS.image as React.ReactElement, { size: 32 })
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
                                    id="sku-image-upload"
                                />
                                <label
                                    htmlFor="sku-image-upload"
                                    className="inline-flex items-center px-4 py-2 bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-lg text-sm font-bold text-foreground dark:text-slate-300 hover:bg-muted/50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                >
                                    {imagePreview ? 'Change Image' : 'Upload Image'}
                                </label>
                                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-1 uppercase font-bold tracking-wider">JPG, PNG or WEBP (Max 2MB)</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="secondary" onClick={() => setIsNewSkuModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateSku} disabled={!newItemData.name || hasConflict}>Create Product</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const InventoryPage: React.FC = () => {
    return (
        <InventoryProvider>
            <InventoryContent />
        </InventoryProvider>
    );
};

export default InventoryPage;
