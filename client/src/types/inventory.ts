
export interface Warehouse {
    id: string;
    name: string;
    code: string;
    location: string;
    isVirtual?: boolean;
}

export interface InventoryItem {
    id: string;
    sku: string;
    barcode?: string; // Barcode for scanning in POS
    name: string;
    /** Free-text brand (mobile / PDP); optional */
    brand?: string;
    /** Primary category id from catalog, or the literal `General` when uncategorized */
    category: string;
    /** Subcategory id when the product is filed under a child category */
    subcategoryId?: string;
    unit: string;
    weight?: number | null;
    weightUnit?: string | null;
    size?: string | null;
    color?: string | null;
    material?: string | null;
    originCountry?: string | null;
    /** Extra key-value specs (JSON from server) */
    attributes?: Record<string, string | number | boolean> | null;
    onHand: number;
    available: number;
    reserved: number;
    inTransit: number;
    damaged: number;
    costPrice: number;
    retailPrice: number;
    reorderPoint: number;
    imageUrl?: string;
    /** Product description shown in the mobile app when user opens the product. */
    description?: string;
    warehouseStock: Record<string, number>; // warehouseId -> quantity
    /** Per-branch qty that is sellable today (non-expired batches), when the server provides it */
    warehouseSellable?: Record<string, number>;
    /** Units sellable today (non-expired batches); falls back to available when absent */
    sellableOnHand?: number;
    /** Earliest future expiry across batches (YYYY-MM-DD), when tracked */
    nearestExpiry?: string | null;
    /** When true, hidden from mobile catalog and POS; still in inventory for management. */
    salesDeactivated?: boolean;
}

export type MovementType =
    | 'Sale'
    | 'Purchase'
    | 'Transfer'
    | 'Adjustment'
    | 'Return'
    | 'Damage'
    | 'Shrinkage'
    | 'MobileSale'
    | 'Reserve'
    | 'ReleaseReserve';

export interface StockMovement {
    id: string;
    itemId: string;
    itemName: string;
    /** Product SKU when provided by the movements API */
    sku?: string;
    type: MovementType;
    quantity: number; // Positive for increase, negative for decrease
    beforeQty: number;
    afterQty: number;
    warehouseId: string;
    referenceId: string; // Sale ID, Transfer ID, etc.
    timestamp: string;
    userId: string;
    notes?: string;
}

export interface StockAdjustment {
    id: string;
    itemId: string;
    warehouseId: string;
    type: 'Increase' | 'Decrease';
    quantity: number;
    reasonCode: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedBy: string;
    approvedBy?: string;
    timestamp: string;
}

export interface StockTransfer {
    id: string;
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    items: {
        itemId: string;
        quantity: number;
        sku: string;
        name: string;
    }[];
    status: 'Draft' | 'In-Transit' | 'Received' | 'Cancelled';
    requestedBy: string;
    receivedBy?: string;
    timestamp: string;
    receivedAt?: string;
    notes?: string;
}
