
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
    InventoryItem,
    Warehouse,
    StockMovement,
    StockAdjustment,
    StockTransfer
} from '../types/inventory';
import { shopApi } from '../services/shopApi';
import { useAuth } from './AuthContext';
import { getFullImageUrl, getBaseUrl } from '../config/apiUrl';
import { fetchAndCacheImage } from '../services/imageCache';
import { isOnline, processPendingProductQueue } from '../services/productSyncService';
import {
    addPendingProduct,
    getAllPendingProducts,
    saveLocalImageBlob,
    type PendingProductPayload,
} from '../services/productSyncStore';
import { subscribeToOnline } from '../services/productSyncService';

interface InventoryContextType {
    items: InventoryItem[];
    warehouses: Warehouse[];
    movements: StockMovement[];
    adjustments: StockAdjustment[];
    transfers: StockTransfer[];

    addItem: (item: InventoryItem, imageFile?: File) => Promise<InventoryItem>;
    updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
    deleteItem: (id: string) => Promise<void>;
    updateStock: (itemId: string, warehouseId: string, delta: number, type: any, referenceId: string, notes?: string) => void;
    requestTransfer: (transfer: Omit<StockTransfer, 'id' | 'timestamp' | 'status'>) => void;
    approveAdjustment: (adjustmentId: string) => void;
    refreshWarehouses: () => Promise<void>; // Refresh warehouses list
    refreshItems: () => Promise<void>; // NEW: Refresh products/SKU list

    // Filters & Dashboard Data
    lowStockItems: InventoryItem[];
    totalInventoryValue: number;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

/** True if the error indicates server/network unavailability so we should save locally and sync later. */
function isRetryableServerOrNetworkError(error: any): boolean {
    const status = error?.status;
    if (status === 0 || status === 502 || status === 503 || status === 504) return true;
    const msg = String(error?.error ?? error?.message ?? '').toLowerCase();
    return /unavailable|bad gateway|network|timed out|overloaded|failed to fetch/i.test(msg);
}

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
    const [transfers, setTransfers] = useState<StockTransfer[]>([]);

    React.useEffect(() => {
        if (!isAuthenticated) return; // Don't fetch until user is logged in

        const fetchData = async () => {
            try {
                console.log('🔄 [InventoryContext] Fetching warehouses, products, and inventory...');
                const [warehousesList, products, inventory, movementList] = await Promise.all([
                    shopApi.getWarehouses(),
                    shopApi.getProducts(),
                    shopApi.getInventory(),
                    shopApi.getMovements()
                ]);

                console.log('📦 [InventoryContext] Raw warehouses from API:', warehousesList);
                console.log('📦 [InventoryContext] Movements count:', movementList?.length || 0);

                // Map Warehouses
                const whs: Warehouse[] = warehousesList.map((w: any) => ({
                    id: w.id,
                    name: w.name,
                    code: w.code,
                    location: w.location || 'Main'
                }));
                setWarehouses(whs);

                // Map Movements
                const mappedMovements: StockMovement[] = movementList.map((m: any) => ({
                    id: m.id,
                    itemId: m.product_id,
                    itemName: m.product_name || 'Unknown Item',
                    type: m.type as any,
                    quantity: parseFloat(m.quantity),
                    beforeQty: 0, // Not stored in DB yet
                    afterQty: 0,  // Not stored in DB yet
                    warehouseId: m.warehouse_id,
                    referenceId: m.reference_id || 'N/A',
                    timestamp: m.created_at,
                    userId: m.user_id || 'system',
                    notes: m.reason
                }));
                setMovements(mappedMovements);

                // Aggregate Stock
                const stockMap: Record<string, { total: number, reserved: number, byWh: Record<string, number> }> = {};

                inventory.forEach((inv: any) => {
                    if (!stockMap[inv.product_id]) {
                        stockMap[inv.product_id] = { total: 0, reserved: 0, byWh: {} };
                    }
                    const qty = parseFloat(inv.quantity_on_hand || '0');
                    const reserved = parseFloat(inv.quantity_reserved || '0');
                    stockMap[inv.product_id].total += qty;
                    stockMap[inv.product_id].reserved += reserved;
                    stockMap[inv.product_id].byWh[inv.warehouse_id] = qty;
                });

                // Map Products to InventoryItems
                const mappedItems: InventoryItem[] = products.map((p: any) => ({
                    id: p.id,
                    sku: p.sku,
                    barcode: p.barcode || undefined,
                    name: p.name,
                    category: p.category_id || 'General',
                    unit: p.unit || 'pcs',
                    onHand: stockMap[p.id]?.total || 0,
                    available: (stockMap[p.id]?.total || 0) - (stockMap[p.id]?.reserved || 0),
                    reserved: stockMap[p.id]?.reserved || 0,
                    inTransit: 0,
                    damaged: 0,
                    costPrice: parseFloat(p.cost_price || '0'),
                    retailPrice: parseFloat(p.retail_price || '0'),
                    reorderPoint: p.reorder_point || 10,
                    imageUrl: getFullImageUrl(p.image_url) || undefined,
                    description: p.mobile_description || p.description || undefined,
                    warehouseStock: stockMap[p.id]?.byWh || {}
                }));

                const pending = await getAllPendingProducts();
                const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                    id: `pending-${p.localId}`,
                    sku: p.payload.sku,
                    barcode: p.payload.barcode ?? undefined,
                    name: p.payload.name,
                    category: p.payload.category_id || 'General',
                    unit: p.payload.unit || 'pcs',
                    onHand: 0,
                    available: 0,
                    reserved: 0,
                    inTransit: 0,
                    damaged: 0,
                    costPrice: p.payload.cost_price ?? 0,
                    retailPrice: p.payload.retail_price ?? 0,
                    reorderPoint: p.payload.reorder_point ?? 10,
                    imageUrl: undefined,
                    description: p.payload.description ?? undefined,
                    warehouseStock: {},
                }));
                setItems([...mappedItems, ...pendingAsItems]);

            } catch (error: any) {
                console.error('Failed to fetch inventory data:', error);
                if (isRetryableServerOrNetworkError(error)) {
                    try {
                        const pending = await getAllPendingProducts();
                        const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                            id: `pending-${p.localId}`,
                            sku: p.payload.sku,
                            barcode: p.payload.barcode ?? undefined,
                            name: p.payload.name,
                            category: p.payload.category_id || 'General',
                            unit: p.payload.unit || 'pcs',
                            onHand: 0,
                            available: 0,
                            reserved: 0,
                            inTransit: 0,
                            damaged: 0,
                            costPrice: p.payload.cost_price ?? 0,
                            retailPrice: p.payload.retail_price ?? 0,
                            reorderPoint: p.payload.reorder_point ?? 10,
                            imageUrl: undefined,
                            warehouseStock: {},
                        }));
                        setItems(pendingAsItems);
                    } catch (e) {
                        console.error('Failed to load pending products:', e);
                    }
                }
            }
        };
        fetchData();
    }, [isAuthenticated]);

    // NEW: Refresh warehouses function
    const refreshWarehouses = useCallback(async () => {
        try {
            console.log('🔄 [InventoryContext] Refreshing warehouses...');
            const warehousesList = await shopApi.getWarehouses();
            const whs: Warehouse[] = warehousesList.map((w: any) => ({
                id: w.id,
                name: w.name,
                code: w.code,
                location: w.location || 'Main'
            }));
            setWarehouses(whs);
            console.log('✅ [InventoryContext] Warehouses refreshed:', whs);
        } catch (error) {
            console.error('Failed to refresh warehouses:', error);
        }
    }, []);

    // NEW: Refresh items/products function
    const refreshItems = useCallback(async () => {
        try {
            console.log('🔄 [InventoryContext] Refreshing products/items...');
            const [products, inventory] = await Promise.all([
                shopApi.getProducts(),
                shopApi.getInventory()
            ]);

            // Aggregate Stock
            const stockMap: Record<string, { total: number, reserved: number, byWh: Record<string, number> }> = {};

            inventory.forEach((inv: any) => {
                if (!stockMap[inv.product_id]) {
                    stockMap[inv.product_id] = { total: 0, reserved: 0, byWh: {} };
                }
                const qty = parseFloat(inv.quantity_on_hand || '0');
                const reserved = parseFloat(inv.quantity_reserved || '0');
                stockMap[inv.product_id].total += qty;
                stockMap[inv.product_id].reserved += reserved;
                stockMap[inv.product_id].byWh[inv.warehouse_id] = qty;
            });

            // Map Products to InventoryItems
            const mappedItems: InventoryItem[] = products.map((p: any) => ({
                id: p.id,
                sku: p.sku,
                barcode: p.barcode || undefined,
                name: p.name,
                category: p.category_id || 'General',
                unit: p.unit || 'pcs',
                onHand: stockMap[p.id]?.total || 0,
                available: (stockMap[p.id]?.total || 0) - (stockMap[p.id]?.reserved || 0),
                reserved: stockMap[p.id]?.reserved || 0,
                inTransit: 0,
                damaged: 0,
                costPrice: parseFloat(p.cost_price || '0'),
                retailPrice: parseFloat(p.retail_price || '0'),
                reorderPoint: p.reorder_point || 10,
                imageUrl: getFullImageUrl(p.image_url) || undefined,
                warehouseStock: stockMap[p.id]?.byWh || {}
            }));

            const pending = await getAllPendingProducts();
            const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                id: `pending-${p.localId}`,
                sku: p.payload.sku,
                barcode: p.payload.barcode ?? undefined,
                name: p.payload.name,
                category: p.payload.category_id || 'General',
                unit: p.payload.unit || 'pcs',
                onHand: 0,
                available: 0,
                reserved: 0,
                inTransit: 0,
                damaged: 0,
                costPrice: p.payload.cost_price ?? 0,
                retailPrice: p.payload.retail_price ?? 0,
                reorderPoint: p.payload.reorder_point ?? 10,
                imageUrl: undefined,
                warehouseStock: {},
            }));
            setItems([...mappedItems, ...pendingAsItems]);
            // Prefill local image cache so product images load offline
            products.filter((p: any) => p.image_url).slice(0, 50).forEach((p: any) => {
                const path = p.image_url.startsWith('/') ? p.image_url : `/${p.image_url}`;
                fetchAndCacheImage(`${getBaseUrl()}${path}`, path).catch(() => {});
            });
            console.log('✅ [InventoryContext] Products refreshed:', mappedItems.length + pendingAsItems.length, 'items');
        } catch (error: any) {
            console.error('Failed to refresh products:', error);
            if (isRetryableServerOrNetworkError(error)) {
                try {
                    const pending = await getAllPendingProducts();
                    const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                        id: `pending-${p.localId}`,
                        sku: p.payload.sku,
                        barcode: p.payload.barcode ?? undefined,
                        name: p.payload.name,
                        category: p.payload.category_id || 'General',
                        unit: p.payload.unit || 'pcs',
                        onHand: 0,
                        available: 0,
                        reserved: 0,
                        inTransit: 0,
                        damaged: 0,
                        costPrice: p.payload.cost_price ?? 0,
                        retailPrice: p.payload.retail_price ?? 0,
                        reorderPoint: p.payload.reorder_point ?? 10,
                        imageUrl: undefined,
                        warehouseStock: {},
                    }));
                    setItems((prev) => [
                        ...prev.filter((i) => !i.id.startsWith('pending-')),
                        ...pendingAsItems,
                    ]);
                } catch (e) {
                    console.error('Failed to merge pending on refresh error:', e);
                }
            }
        }
    }, []);

    React.useEffect(() => {
        const runSync = async () => {
            const result = await processPendingProductQueue();
            if (result.succeeded > 0) await refreshItems();
        };
        const unsub = subscribeToOnline(runSync);
        if (typeof navigator !== 'undefined' && navigator.onLine) runSync();
        return unsub;
    }, [refreshItems]);

    const updateStock = useCallback(async (
        itemId: string,
        warehouseId: string,
        delta: number,
        type: any,
        referenceId: string,
        notes?: string
    ) => {
        try {
            await shopApi.adjustInventory({
                productId: itemId,
                warehouseId,
                quantity: delta,
                type,
                referenceId,
                reason: notes
            });

            // Update local state optmistically or fetch again
            setItems(prev => prev.map(item => {
                if (item.id === itemId) {
                    const beforeQty = item.onHand;
                    const afterQty = beforeQty + delta;

                    // Add movement log
                    const movement: StockMovement = {
                        id: crypto.randomUUID(),
                        itemId,
                        itemName: item.name,
                        type,
                        quantity: delta,
                        beforeQty,
                        afterQty,
                        warehouseId,
                        referenceId,
                        timestamp: new Date().toISOString(),
                        userId: 'admin-1',
                        notes
                    };
                    setMovements(m => [movement, ...m]);

                    return {
                        ...item,
                        onHand: afterQty,
                        available: item.available + delta,
                        warehouseStock: {
                            ...item.warehouseStock,
                            [warehouseId]: (item.warehouseStock[warehouseId] || 0) + delta
                        }
                    };
                }
                return item;
            }));
        } catch (error) {
            console.error('Failed to update stock:', error);
            throw error;
        }
    }, []);

    const addItem = useCallback(async (item: InventoryItem, imageFile?: File) => {
        const payload: PendingProductPayload = {
            sku: item.sku,
            barcode: item.barcode || null,
            name: item.name,
            category_id: item.category === 'General' ? null : item.category,
            retail_price: item.retailPrice,
            cost_price: item.costPrice,
            unit: item.unit,
            reorder_point: item.reorderPoint,
            description: item.description || null,
        };

        const saveOfflineAndReturn = async (): Promise<InventoryItem> => {
            let localImageId: string | undefined;
            if (imageFile) {
                localImageId = await saveLocalImageBlob(imageFile);
            }
            await addPendingProduct({ ...payload, localImageId });
            const placeholder = { ...item, id: `pending-${Date.now()}` };
            setItems(prev => [...prev, placeholder]);
            return placeholder;
        };

        if (!isOnline()) {
            try {
                const placeholder = await saveOfflineAndReturn();
                return placeholder;
            } catch (e) {
                console.error('Failed to save SKU offline:', e);
                alert('Could not save product locally. Please try again.');
                throw e;
            }
        }

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            if (!token || token.trim() === '') {
                alert('Please log in to create products. Your session may have expired.');
                throw new Error('No authentication token');
            }

            let imageRelPath: string | undefined;
            try {
                if (imageFile) {
                    const uploadRes = await shopApi.uploadImage(imageFile);
                    imageRelPath = uploadRes.imageUrl || undefined;
                }
            } catch (uploadErr: any) {
                if (isRetryableServerOrNetworkError(uploadErr)) {
                    const placeholder = await saveOfflineAndReturn();
                    alert('Product saved locally. It will sync to the cloud when the server is available.');
                    return placeholder;
                }
                throw uploadErr;
            }

            const imageUrlForDb = imageRelPath ?? item.imageUrl;

            try {
                const response = await shopApi.createProduct({
                    ...payload,
                    image_url: imageUrlForDb,
                    mobile_description: payload.description || undefined,
                }) as any;
                if (response && response.id) {
                    const newItem = { ...item, id: response.id, imageUrl: imageUrlForDb ? getFullImageUrl(imageUrlForDb) : undefined };
                    setItems(prev => [...prev, newItem]);
                    await refreshItems();
                    return newItem;
                }
                throw new Error("Invalid response from server");
            } catch (createErr: any) {
                if (isRetryableServerOrNetworkError(createErr)) {
                    const placeholder = await saveOfflineAndReturn();
                    alert('Product saved locally. It will sync to the cloud when the server is available.');
                    return placeholder;
                }
                throw createErr;
            }
        } catch (error: any) {
            console.error("Failed to create product:", error);
            const status = error?.status;
            const msg = error?.error || error?.message || (typeof error === 'string' ? error : 'Check your SKU uniqueness or category.');
            if (status === 401 || /authentication token|session.*expired|not logged in/i.test(String(msg))) {
                alert('Session expired or not logged in. Please log in again to create products.');
            } else {
                alert(`Failed to save SKU to database: ${msg}`);
            }
            throw error;
        }
    }, [refreshItems]);

    const updateItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
        try {
            const payload: any = {};
            if (updates.name !== undefined) payload.name = updates.name;
            if (updates.sku !== undefined) payload.sku = updates.sku;
            if (updates.barcode !== undefined) payload.barcode = updates.barcode;
            if (updates.category) payload.category_id = updates.category === 'General' ? null : updates.category;
            if (updates.retailPrice !== undefined) payload.retail_price = updates.retailPrice;
            if (updates.costPrice !== undefined) payload.cost_price = updates.costPrice;
            if (updates.unit) payload.unit = updates.unit;
            if (updates.reorderPoint !== undefined) payload.reorder_point = updates.reorderPoint;
            if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
            if (updates.description !== undefined) payload.mobile_description = updates.description;

            await shopApi.updateProduct(id, payload);

            // Refresh items to sync local state
            await refreshItems();
        } catch (error: any) {
            console.error("Failed to update product:", error);
            alert(`Failed to update product: ${error.message}`);
            throw error;
        }
    }, [refreshItems]);

    const deleteItem = useCallback(async (id: string) => {
        if (id.startsWith('pending-')) {
            throw new Error('Cannot delete a product that has not been synced to the server yet.');
        }
        try {
            await shopApi.deleteProduct(id);
            await refreshItems();
        } catch (error: any) {
            const msg = error?.error ?? error?.message ?? '';
            const msgStr = String(msg);
            const defaultMsg = 'This SKU cannot be deleted. Clear inventory and ensure it is not used in any sales or procurement transactions.';
            throw new Error(typeof msg === 'string' && msg.length > 0 ? msg : defaultMsg);
        }
    }, [refreshItems]);

    const requestTransfer = useCallback((transfer: Omit<StockTransfer, 'id' | 'timestamp' | 'status'>) => {
        const newTransfer: StockTransfer = {
            ...transfer,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            status: 'In-Transit'
        };
        setTransfers(prev => [newTransfer, ...prev]);

        // Update stock for in-transit
        transfer.items.forEach(item => {
            updateStock(item.itemId, transfer.sourceWarehouseId, -item.quantity, 'Transfer', newTransfer.id, `Transfer to ${transfer.destinationWarehouseId}`);
        });
    }, [updateStock]);

    const approveAdjustment = useCallback((adjustmentId: string) => {
        setAdjustments(prev => prev.map(adj => {
            if (adj.id === adjustmentId) {
                updateStock(adj.itemId, adj.warehouseId, adj.type === 'Increase' ? adj.quantity : -adj.quantity, 'Adjustment', adj.id, adj.reasonCode);
                return { ...adj, status: 'Approved', approvedBy: 'supervisor-1' };
            }
            return adj;
        }));
    }, [updateStock]);

    const lowStockItems = useMemo(() =>
        items.filter(item => item.onHand <= item.reorderPoint),
        [items]);

    const totalInventoryValue = useMemo(() =>
        items.reduce((sum, item) => sum + (item.onHand * item.costPrice), 0),
        [items]);

    const value = useMemo(() => ({
        items,
        warehouses,
        movements,
        adjustments,
        transfers,
        addItem,
        updateItem,
        deleteItem,
        updateStock,
        requestTransfer,
        approveAdjustment,
        refreshWarehouses,
        refreshItems,
        lowStockItems,
        totalInventoryValue
    }), [items, warehouses, movements, adjustments, transfers, addItem, updateItem, deleteItem, updateStock, requestTransfer, approveAdjustment, refreshWarehouses, refreshItems, lowStockItems, totalInventoryValue]);

    return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error('useInventory must be used within an InventoryProvider');
    return context;
};
