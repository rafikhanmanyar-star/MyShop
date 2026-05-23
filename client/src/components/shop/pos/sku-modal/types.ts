import type { InventoryItem } from '../../../../types/inventory';

export type AddOrEditSkuModalMode = 'choice' | 'search' | 'add' | 'edit';

export type SkuFormStatus = 'draft' | 'active' | 'archived';

export type SkuSectionId = 'basic' | 'organization' | 'pricing' | 'inventory' | 'attributes' | 'media';

export interface SkuFormValues {
    sku: string;
    barcode: string;
    name: string;
    description: string;
    mobileDescription: string;
    category: string;
    subcategoryId: string;
    retailPrice: number;
    costPrice: number;
    wholesalePrice: number;
    taxRate: number;
    retailPriceMode: 'fixed' | 'percentage';
    retailMarkupPercent: number;
    reorderPoint: number;
    unit: string;
    imageUrl: string;
    salesDeactivated: boolean;
    trackInventory: boolean;
    brand: string;
    brandId: string;
    weight: string;
    weightUnit: string;
    size: string;
    color: string;
    material: string;
    originCountry: string;
    tags: string[];
    collection: string;
    customAttrRows: { key: string; value: string }[];
}

export interface AddOrEditSkuModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSkuOrBarcode?: string;
    openInAddMode?: boolean;
    closeOnBackFromAdd?: boolean;
    initialEditingItem?: InventoryItem | null;
    onItemReady?: (item: InventoryItem, action?: 'created' | 'updated') => void;
}

export type SkuComboOption = { value: string; label: string };

export const SKU_SECTIONS: { id: SkuSectionId; label: string }[] = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'organization', label: 'Organization' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'media', label: 'Media' }
];
