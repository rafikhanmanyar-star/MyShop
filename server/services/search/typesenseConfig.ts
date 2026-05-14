export function isTypesenseConfigured(): boolean {
    return Boolean(
        process.env.TYPESENSE_HOST &&
            process.env.TYPESENSE_API_KEY &&
            (process.env.TYPESENSE_COLLECTION_PRODUCTS || 'shop_products').length > 0
    );
}

export function getTypesenseCollectionName(): string {
    return process.env.TYPESENSE_COLLECTION_PRODUCTS || 'shop_products';
}
