
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
import { showAppToast } from '../utils/appToast';
import type { ProductApiResult } from '../services/shopApi';

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
    /** Loads movement ledger (lazy; avoids blocking inventory list). */
    loadMovements: () => Promise<void>;

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
    return /unavailable|bad gateway|network|timed out|overloaded|failed to fetch|networkerror|no internet/i.test(msg);
}

async function withRetries<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    let lastErr: any;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e: any) {
            lastErr = e;
            if (!isRetryableServerOrNetworkError(e) || i === retries) throw e;
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    throw lastErr;
}

function mapServerProductToItem(p: any): InventoryItem {
    return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode || undefined,
        name: p.name,
        category: p.category_id || 'General',
        subcategoryId: p.subcategory_id || undefined,
        unit: p.unit || 'pcs',
        onHand: 0,
        available: 0,
        reserved: 0,
        inTransit: 0,
        damaged: 0,
        costPrice: parseFloat(p.cost_price || '0'),
        retailPrice: parseFloat(p.retail_price || '0'),
        reorderPoint: p.reorder_point || 10,
        imageUrl: getFullImageUrl(p.image_url) || undefined,
        description: p.mobile_description || p.description || undefined,
        warehouseStock: {},
        salesDeactivated: Boolean(p.sales_deactivated),
    };
}

/** Row from GET /shop/inventory/skus — single round-trip stock + product fields. */
function mapSkuRowToInventoryItem(r: any): InventoryItem {
    let ws: Record<string, number> = {};
    if (r.warehouse_stock != null) {
        let raw: unknown = r.warehouse_stock;
        if (typeof r.warehouse_stock === 'string') {
            try {
                raw = JSON.parse(r.warehouse_stock);
            } catch {
                raw = {};
            }
        }
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const k of Object.keys(raw as object)) {
                ws[k] = Number((raw as Record<string, unknown>)[k]) || 0;
            }
        }
    }
    const onHand = Number(r.on_hand) || 0;
    const available = Number(r.available) || 0;
    const reserved = Number(r.reserved_total) || 0;
    const exp = r.nearest_expiry;
    const nearestExpiry =
        exp == null || exp === ''
            ? null
            : typeof exp === 'string'
              ? exp.slice(0, 10)
              : String(exp).slice(0, 10);
    return {
        id: r.id,
        sku: r.sku,
        barcode: r.barcode || undefined,
        name: r.name,
        category: r.category_id || 'General',
        subcategoryId: r.subcategory_id || undefined,
        unit: r.unit || 'pcs',
        onHand,
        available,
        reserved,
        sellableOnHand: available,
        inTransit: 0,
        damaged: 0,
        costPrice: parseFloat(r.cost_price || '0'),
        retailPrice: parseFloat(r.retail_price || '0'),
        reorderPoint: r.reorder_point ?? 10,
        imageUrl: getFullImageUrl(r.image_url) || undefined,
        description: r.mobile_description || undefined,
        warehouseStock: ws,
        nearestExpiry: nearestExpiry ?? undefined,
        salesDeactivated: Boolean(r.sales_deactivated),
    };
}

/** Legacy merge when GET /inventory/skus is empty or unavailable (same rules as original inventory load). */
function mergeLegacyProductsInventory(products: any[], inventory: any[]): InventoryItem[] {
    const stockMap: Record<
        string,
        { total: number; reserved: number; sellable: number; byWh: Record<string, number> }
    > = {};
    inventory.forEach((inv: any) => {
        if (!stockMap[inv.product_id]) {
            stockMap[inv.product_id] = { total: 0, reserved: 0, sellable: 0, byWh: {} };
        }
        const qty = parseFloat(inv.quantity_on_hand || '0');
        const reserved = parseFloat(inv.quantity_reserved || '0');
        const availRow =
            parseFloat(inv.sellable_on_hand ?? '0') || Math.max(0, qty - reserved);
        stockMap[inv.product_id].total += qty;
        stockMap[inv.product_id].reserved += reserved;
        stockMap[inv.product_id].sellable += Math.max(0, availRow);
        stockMap[inv.product_id].byWh[inv.warehouse_id] = qty;
    });
    return products.map((p: any) => ({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode || undefined,
        name: p.name,
        category: p.category_id || 'General',
        subcategoryId: p.subcategory_id || undefined,
        unit: p.unit || 'pcs',
        onHand: stockMap[p.id]?.total || 0,
        available:
            stockMap[p.id]?.sellable ??
            Math.max(0, (stockMap[p.id]?.total || 0) - (stockMap[p.id]?.reserved || 0)),
        sellableOnHand: stockMap[p.id]?.sellable,
        reserved: stockMap[p.id]?.reserved || 0,
        inTransit: 0,
        damaged: 0,
        costPrice: parseFloat(p.cost_price || '0'),
        retailPrice: parseFloat(p.retail_price || '0'),
        reorderPoint: p.reorder_point || 10,
        imageUrl: getFullImageUrl(p.image_url) || undefined,
        description: p.mobile_description || p.description || undefined,
        warehouseStock: stockMap[p.id]?.byWh || {},
        salesDeactivated: Boolean(p.sales_deactivated),
    }));
}

function mapMovementRows(movementList: any[]): StockMovement[] {
    return movementList.map((m: any) => ({
        id: m.id,
        itemId: m.product_id,
        itemName: m.product_name || 'Unknown Item',
        type: m.type as any,
        quantity: parseFloat(m.quantity),
        beforeQty: 0,
        afterQty: 0,
        warehouseId: m.warehouse_id,
        referenceId: m.reference_id || 'N/A',
        timestamp: m.created_at,
        userId: m.user_id || 'system',
        notes: m.reason,
    }));
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
                const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
                console.log('🔄 [InventoryContext] Fetching warehouses + inventory SKUs (single request)...');
                const [warehousesList, skuPack] = await Promise.all([
                    shopApi.getWarehouses(),
                    shopApi.getInventorySkus({ page: 1, limit: 10000 }),
                ]);

                if (import.meta.env.DEV && skuPack) {
                    console.log(
                        `[perf] inventory/skus: ${(skuPack as any).serverMs ?? '?'}ms server, ${(skuPack as any).routeMs ?? '?'}ms route, ${(skuPack as any).items?.length ?? 0} items`
                    );
                }
                if (t0 && import.meta.env.DEV) {
                    console.log(`[perf] inventory context fetch ${(performance.now() - t0).toFixed(0)}ms (client)`);
                }

                console.log('📦 [InventoryContext] Raw warehouses from API:', warehousesList);

                // Map Warehouses
                const whs: Warehouse[] = warehousesList.map((w: any) => ({
                    id: w.id,
                    name: w.name,
                    code: w.code,
                    location: w.location || 'Main'
                }));
                setWarehouses(whs);

                let mappedItems: InventoryItem[] = (skuPack.items || []).map(mapSkuRowToInventoryItem);
                if (mappedItems.length === 0) {
                    try {
                        const [products, inventory] = await Promise.all([
                            shopApi.getProducts(),
                            shopApi.getInventory(),
                        ]);
                        if (Array.isArray(products) && products.length > 0) {
                            mappedItems = mergeLegacyProductsInventory(products, inventory || []);
                            console.warn(
                                '[InventoryContext] /inventory/skus returned 0 rows; loaded SKUs via legacy products + inventory merge.'
                            );
                        }
                    } catch (fbErr) {
                        console.warn('[InventoryContext] Legacy inventory fallback failed:', fbErr);
                    }
                }

                const pending = await getAllPendingProducts();
                const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                    id: `pending-${p.localId}`,
                    sku: p.payload.sku,
                    barcode: p.payload.barcode ?? undefined,
                    name: p.payload.name,
                    category: p.payload.category_id || 'General',
                    subcategoryId: p.payload.subcategory_id || undefined,
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
                            subcategoryId: p.payload.subcategory_id || undefined,
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

    const loadMovements = useCallback(async () => {
        try {
            const movementList = await shopApi.getMovements(undefined, 5000);
            setMovements(mapMovementRows(movementList || []));
        } catch (e) {
            console.error('Failed to load inventory movements:', e);
        }
    }, []);

    // NEW: Refresh items/products function
    const refreshItems = useCallback(async () => {
        try {
            console.log('🔄 [InventoryContext] Refreshing products/items...');
            const skuPack = await shopApi.getInventorySkus({ page: 1, limit: 10000 });
            let mappedItems: InventoryItem[] = (skuPack.items || []).map(mapSkuRowToInventoryItem);
            if (mappedItems.length === 0) {
                try {
                    const [products, inventory] = await Promise.all([
                        shopApi.getProducts(),
                        shopApi.getInventory(),
                    ]);
                    if (Array.isArray(products) && products.length > 0) {
                        mappedItems = mergeLegacyProductsInventory(products, inventory || []);
                    }
                } catch (fbErr) {
                    console.warn('[InventoryContext] Legacy refresh fallback failed:', fbErr);
                }
            }

            const pending = await getAllPendingProducts();
            const pendingAsItems: InventoryItem[] = pending.map((p) => ({
                id: `pending-${p.localId}`,
                sku: p.payload.sku,
                barcode: p.payload.barcode ?? undefined,
                name: p.payload.name,
                category: p.payload.category_id || 'General',
                subcategoryId: p.payload.subcategory_id || undefined,
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
            mappedItems.filter((it) => it.imageUrl).slice(0, 50).forEach((it) => {
                const rel = it.imageUrl!.replace(/^https?:\/\/[^/]+/, '');
                const path = rel.startsWith('/') ? rel : `/${rel}`;
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
                        subcategoryId: p.payload.subcategory_id || undefined,
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
            subcategory_id:
                item.category !== 'General' && item.subcategoryId ? item.subcategoryId : null,
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
                const createRes = await withRetries(() =>
                    shopApi.createProduct({
                        ...payload,
                        image_url: imageUrlForDb,
                        mobile_description: payload.description || undefined,
                    })
                );
                const legacy = createRes as ProductApiResult & { id?: string };
                const newId = (legacy.data?.id as string | undefined) ?? legacy.id;
                if (!createRes.success || !newId) {
                    const msg = createRes.message || 'Failed to save product';
                    showAppToast(msg, 'error');
                    throw new Error(msg);
                }

                const verifyRes = await withRetries(() => shopApi.getProduct(newId));
                if (!verifyRes.success || !verifyRes.data) {
                    showAppToast('Data not saved. Please retry.', 'error');
                    throw new Error('Post-save verification failed');
                }

                await refreshItems();
                return mapServerProductToItem(verifyRes.data);
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
            } else if (!String(msg).includes('Post-save verification')) {
                showAppToast(`Failed to save SKU: ${msg}`, 'error');
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
            if (updates.category !== undefined) {
                payload.category_id = updates.category === 'General' ? null : updates.category;
                if (updates.category === 'General') {
                    payload.subcategory_id = null;
                }
            }
            if (updates.subcategoryId !== undefined) {
                if (updates.category === 'General') {
                    payload.subcategory_id = null;
                } else {
                    payload.subcategory_id = updates.subcategoryId || null;
                }
            }
            if (updates.retailPrice !== undefined) payload.retail_price = updates.retailPrice;
            if (updates.costPrice !== undefined) payload.cost_price = updates.costPrice;
            if (updates.unit) payload.unit = updates.unit;
            if (updates.reorderPoint !== undefined) payload.reorder_point = updates.reorderPoint;
            if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
            if (updates.description !== undefined) payload.mobile_description = updates.description;
            if (updates.salesDeactivated !== undefined) payload.sales_deactivated = updates.salesDeactivated;

            const updateRes = await withRetries(() => shopApi.updateProduct(id, payload));
            if (!updateRes.success) {
                throw new Error(updateRes.message || 'Failed to update product');
            }

            const verifyRes = await withRetries(() => shopApi.getProduct(id));
            if (!verifyRes.success || !verifyRes.data) {
                showAppToast('Data not saved. Please retry.', 'error');
                throw new Error('Post-save verification failed');
            }

            await refreshItems();
        } catch (error: any) {
            console.error("Failed to update product:", error);
            const msg = error?.error || error?.message || 'Update failed';
            if (!String(msg).includes('Post-save verification')) {
                showAppToast(String(msg), 'error');
            }
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
        loadMovements,
        lowStockItems,
        totalInventoryValue
    }), [items, warehouses, movements, adjustments, transfers, addItem, updateItem, deleteItem, updateStock, requestTransfer, approveAdjustment, refreshWarehouses, refreshItems, loadMovements, lowStockItems, totalInventoryValue]);

    return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error('useInventory must be used within an InventoryProvider');
    return context;
};
