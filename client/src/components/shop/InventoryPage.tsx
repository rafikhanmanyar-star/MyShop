import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import InventoryDashboard from './inventory/InventoryDashboard';
import StockMaster from './inventory/StockMaster';
import StockMovements from './inventory/StockMovements';
import StockAdjustments from './inventory/StockAdjustments';
import InventoryCategories from './inventory/InventoryCategories';
import IncompleteProductsTab from './inventory/IncompleteProductsTab';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { shopApi, ShopProductCategory } from '../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../config/apiUrl';
const InventoryContent: React.FC = () => {
    const { items, addItem, refreshItems } = useInventory();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'movements' | 'adjustments' | 'categories' | 'incomplete'>('dashboard');
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

    // When modal opens, refresh categories
    useEffect(() => {
        if (!isNewSkuModalOpen) return;
        loadShopCategories();
    }, [isNewSkuModalOpen, loadShopCategories]);

    /** Main and sub categories with a display label (Parent › Sub) for the picker. */
    const categoryPickerRows = useMemo(() => {
        const byId = new Map(shopCategories.map((c) => [c.id, c]));
        const rows = shopCategories.map((c) => {
            const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
            const label = parent ? `${parent.name} › ${c.name}` : c.name;
            return { id: c.id, name: c.name, label };
        });
        return [...rows].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }, [shopCategories]);

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
        { id: 'incomplete', label: 'Incomplete SKUs', icon: ICONS.alertTriangle },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-foreground dark:text-slate-200 tracking-tight">Inventory Management</h1>
                        <p className="text-muted-foreground dark:text-muted-foreground text-sm font-medium">Enterprise-level stock control and logistics.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsNewSkuModalOpen(true)}
                            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-primary-900/20 transition-all hover:bg-primary-700 dark:shadow-primary-950/40"
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
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-muted-foreground dark:text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 rounded-t-full bg-primary-600 dark:bg-primary-400"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content area: flex so Stock Master / Dashboard / Movements can fill and scroll internally; other tabs can scroll here */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-8">
                <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${['stock', 'dashboard', 'movements', 'categories', 'incomplete'].includes(activeTab) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {activeTab === 'dashboard' && <div className="flex-1 min-h-0 flex flex-col"><InventoryDashboard /></div>}
                    {activeTab === 'stock' && <div className="flex-1 min-h-0 flex flex-col"><StockMaster /></div>}
                    {activeTab === 'movements' && <div className="flex-1 min-h-0 flex flex-col"><StockMovements /></div>}
                    {activeTab === 'adjustments' && <StockAdjustments />}
                    {activeTab === 'categories' && (
                        <div className="flex-1 min-h-0 flex flex-col min-w-0">
                            <InventoryCategories />
                        </div>
                    )}
                    {activeTab === 'incomplete' && (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <IncompleteProductsTab />
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
                        <div>
                            <label
                                htmlFor="inventory-create-sku-category"
                                className="block text-sm font-medium text-foreground dark:text-slate-300 mb-1"
                            >
                                Category
                            </label>
                            <select
                                id="inventory-create-sku-category"
                                className="block w-full rounded-md border border-gray-300 bg-card px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                value={newItemData.category}
                                onChange={(e) =>
                                    setNewItemData({ ...newItemData, category: e.target.value })
                                }
                            >
                                <option value="General">General</option>
                                {categoryPickerRows.map((row) => (
                                    <option key={row.id} value={row.id}>
                                        {row.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                                Includes subcategories as &quot;Parent › Sub&quot;.
                            </p>
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
                                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1 uppercase font-bold tracking-wider">JPG, PNG or WEBP (Max 2MB)</p>
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
