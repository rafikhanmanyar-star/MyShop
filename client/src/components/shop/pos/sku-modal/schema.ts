import { z } from 'zod';

const attrRowSchema = z.object({
    key: z.string(),
    value: z.string()
});

export const skuFormSchema = z.object({
    sku: z.string(),
    barcode: z.string(),
    name: z.string().min(1, 'Product name is required'),
    description: z.string(),
    mobileDescription: z.string(),
    category: z.string(),
    subcategoryId: z.string(),
    retailPrice: z.number().min(0),
    costPrice: z.number().min(0),
    wholesalePrice: z.number().min(0),
    taxRate: z.number().min(0).max(100),
    retailPriceMode: z.enum(['fixed', 'percentage']),
    retailMarkupPercent: z.number().min(0),
    reorderPoint: z.number().min(0),
    unit: z.string().min(1, 'Unit is required'),
    imageUrl: z.string(),
    salesDeactivated: z.boolean(),
    trackInventory: z.boolean(),
    brand: z.string(),
    brandId: z.string(),
    weight: z.string().refine((v) => !v.trim() || Number.isFinite(Number(v)), {
        message: 'Weight must be a valid number'
    }),
    weightUnit: z.string(),
    size: z.string(),
    color: z.string(),
    material: z.string(),
    originCountry: z.string(),
    tags: z.array(z.string()),
    collection: z.string(),
    customAttrRows: z.array(attrRowSchema)
});

export type SkuFormSchema = z.infer<typeof skuFormSchema>;
