
import { TransactionType } from '../types';

export interface POSProduct {
    id: string;
    sku: string;
    barcode: string;
    name: string;
    price: number;
    cost: number;
    categoryId: string;
    /** Secondary category tag from catalog (subcategory row id), when set */
    subcategoryId?: string;
    imageUrl?: string;
    taxRate: number;
    isTaxInclusive: boolean;
    variants?: POSProductVariant[];
    isWeightBased?: boolean;
    unit: string;
    stockLevel: number;
    /** On-hand qty at the selected branch (can exceed stockLevel if batches are expired). */
    onHandAtBranch?: number;
    /** Branch has inventory on hand but nothing left to sell (e.g. only expired batches). */
    onlyExpiredStock?: boolean;
    reorderPoint?: number;
    popularityScore?: number;
    /** Hidden from POS grid when true (manual deactivate for sales). */
    salesDeactivated?: boolean;
}

export interface POSProductVariant {
    id: string;
    name: string; // e.g. "Red / Large"
    sku: string;
    barcode: string;
    priceAdjustment: number;
    stockLevel: number;
}

export interface POSCartItem {
    id: string; // Unique ID for this cart line
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    discountPercentage: number;
    taxAmount: number;
    taxRate: number;
    notes?: string;
    isFree?: boolean;
    priceOverridden?: boolean;
    categoryId?: string;
    imageUrl?: string;
    /** Max quantity allowed (stock at add time); used to cap manual quantity increases. */
    stockLevel?: number;
}

export interface POSPayment {
    id: string;
    method: POSPaymentMethod;
    amount: number;
    reference?: string; // e.g. Card last 4, Transaction ID
    bankAccountId?: string;
    bankAccountName?: string;
}

export enum POSPaymentMethod {
    CASH = 'Cash',
    ONLINE = 'Online',
    KHATA = 'Khata / Credit'
}

export interface POSHeldSale {
    id: string;
    reference: string;
    cart: POSCartItem[];
    customerId?: string;
    /** Set when held customer is a loyalty member so recall + checkout still earn points. */
    loyaltyMemberId?: string | null;
    heldAt: string;
    cashierId: string;
    total: number;
}

export interface POSShift {
    id: string;
    cashierId: string;
    terminalId: string;
    openedAt: string;
    closedAt?: string;
    openingBalance: number;
    closingBalance?: number;
    actualCash?: number;
    expectedCash?: number;
}

export interface POSCustomer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    /** `shop_loyalty_members.id` when this contact is enrolled; required for awarding points on sale. */
    loyaltyMemberId?: string | null;
    /** True when staff marked the linked mobile app customer as verified in Loyalty. */
    mobileCustomerVerified?: boolean;
    points: number;
    creditLimit: number;
    balance: number;
    tier: 'Standard' | 'Silver' | 'Gold' | 'Platinum' | 'VIP';
}

export interface POSSessionState {
    currentCart: POSCartItem[];
    currentCustomer: POSCustomer | null;
    currentShift: POSShift | null;
    heldSales: POSHeldSale[];
    activeTerminalId: string;
}

export interface POSSale {
    id?: string;
    source?: string; // e.g. 'POS' | 'Mobile'
    reprintCount?: number;
    reprint_count?: number;
    saleNumber: string;
    branchId: string;
    terminalId: string;
    userId: string;
    customerId?: string;
    customerName?: string;
    loyaltyMemberId?: string | null;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    totalPaid: number;
    changeDue: number;
    paymentMethod: string;
    /** Server status (e.g. Completed) — used in archive filters */
    status?: string;
    paymentDetails: POSPayment[];
    items: {
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        taxAmount: number;
        discountAmount: number;
        subtotal: number;
        /** Unit cost snapshot at sale time (server); not sent when creating a sale. */
        unitCostAtSale?: number | null;
    }[];
    createdAt: string;
}
