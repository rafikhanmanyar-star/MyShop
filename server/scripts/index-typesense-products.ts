/**
 * One-shot Typesense indexer for mobile catalog documents.
 * Usage: TYPESENSE_HOST=... TYPESENSE_API_KEY=... DATABASE_URL=... npx tsx scripts/index-typesense-products.ts [tenantId?]
 *
 * Creates collection if missing (schema from typesenseProductSearchService).
 */
import 'dotenv/config';
import Typesense from 'typesense';
import { getDatabaseService } from '../services/databaseService.js';
import { mobileProductSellableStockSql } from '../services/mobileOrderService.js';
import { getTypesenseCollectionName, isTypesenseConfigured } from '../services/search/typesenseConfig.js';
import { TYPESENSE_PRODUCT_SCHEMA_FIELDS } from '../services/search/typesenseProductSearchService.js';

function tagsFromAttributes(raw: unknown): string {
    if (raw == null) return '';
    try {
        const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray((j as any).tags)) return (j as any).tags.map(String).join(', ');
        if (typeof (j as any).tags === 'string') return String((j as any).tags);
    } catch {
        /* ignore */
    }
    return '';
}

async function main() {
    if (!isTypesenseConfigured()) {
        console.error('Set TYPESENSE_HOST, TYPESENSE_API_KEY, and optionally TYPESENSE_COLLECTION_PRODUCTS');
        process.exit(1);
    }
    const tenantArg = process.argv[2];
    const db = getDatabaseService();
    const stock = mobileProductSellableStockSql();
    const collectionName = getTypesenseCollectionName();

    const protocol = (process.env.TYPESENSE_PROTOCOL || 'https') as 'http' | 'https';
    const port = process.env.TYPESENSE_PORT ? parseInt(process.env.TYPESENSE_PORT, 10) : protocol === 'https' ? 443 : 8108;
    const client = new Typesense.Client({
        nodes: [{ host: process.env.TYPESENSE_HOST!, port, protocol }],
        apiKey: process.env.TYPESENSE_API_KEY!,
        connectionTimeoutSeconds: 10,
    });

    try {
        await client.collections(collectionName).retrieve();
    } catch {
        console.log('Creating collection', collectionName);
        await client.collections().create({
            name: collectionName,
            fields: TYPESENSE_PRODUCT_SCHEMA_FIELDS as any,
            default_sorting_field: 'total_sales',
        });
    }

    let tenants: { id: string }[] = await db.query(`SELECT id FROM tenants ORDER BY company_name`);
    if (tenantArg) tenants = tenants.filter((t) => t.id === tenantArg);
    if (!tenants.length) {
        console.error('No tenants to index');
        process.exit(1);
    }

    for (const { id: tenantId } of tenants) {
        const rows = await db.query(
            `SELECT p.id, p.tenant_id, p.name, p.sku, p.mobile_description, p.retail_price, p.mobile_price,
                    p.is_on_sale, p.discount_percentage, p.total_sales, p.rating_avg, p.popularity_score,
                    p.category_id, p.subcategory_id, p.brand_id, p.brand, p.color, p.size, p.attributes,
                    p.created_at, p.is_pre_order,
                    c.name AS category_name, sc.name AS subcategory_name, b.name AS brand_join_name,
                    ${stock} AS available_stock
             FROM shop_products p
             LEFT JOIN categories c ON p.category_id = c.id AND c.tenant_id = p.tenant_id
             LEFT JOIN categories sc ON p.subcategory_id = sc.id AND sc.tenant_id = p.tenant_id
             LEFT JOIN shop_brands b ON p.brand_id = b.id AND b.tenant_id = p.tenant_id
             WHERE p.tenant_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE
               AND COALESCE(p.sales_deactivated, FALSE) = FALSE
               AND COALESCE(p.mobile_price, p.retail_price) > 0`,
            [tenantId]
        );

        const docs = rows.map((r: any) => {
            const price = r.mobile_price != null ? parseFloat(r.mobile_price) || 0 : parseFloat(r.retail_price) || 0;
            const stockN = parseFloat(r.available_stock) || 0;
            const pre = Boolean(r.is_pre_order);
            const inStock = stockN > 0 || pre;
            const brand = (r.brand && String(r.brand).trim()) || (r.brand_join_name && String(r.brand_join_name).trim()) || '';
            const created = r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : 0;
            return {
                id: String(r.id),
                tenant_id: String(r.tenant_id),
                name: String(r.name || ''),
                sku: r.sku ? String(r.sku) : '',
                brand,
                brand_id: r.brand_id ? String(r.brand_id) : '',
                category: r.category_name ? String(r.category_name) : '',
                category_id: r.category_id ? String(r.category_id) : '',
                subcategory: r.subcategory_name ? String(r.subcategory_name) : '',
                subcategory_id: r.subcategory_id ? String(r.subcategory_id) : '',
                tags: tagsFromAttributes(r.attributes),
                short_description: r.mobile_description ? String(r.mobile_description).slice(0, 2000) : '',
                price,
                in_stock: inStock,
                is_on_sale: Boolean(r.is_on_sale),
                discount_percentage: parseFloat(r.discount_percentage) || 0,
                total_sales: parseFloat(r.total_sales) || 0,
                rating_avg: parseFloat(r.rating_avg) || 0,
                popularity_score: parseFloat(r.popularity_score) || 0,
                color: r.color ? String(r.color) : '',
                size: r.size ? String(r.size) : '',
                seller_name: '',
                created_at: created,
            };
        });

        if (docs.length === 0) {
            console.log('Tenant', tenantId, ': no documents');
            continue;
        }
        const r = await client.collections(collectionName).documents().import(docs, { action: 'upsert' });
        const failed = (r as any[]).filter((x) => !x.success);
        console.log('Tenant', tenantId, 'indexed', docs.length, 'failed', failed.length);
        if (failed.length) console.error(failed.slice(0, 3));
    }

    await getDatabaseService().close();
    console.log('Done');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
