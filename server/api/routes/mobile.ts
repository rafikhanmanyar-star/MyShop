import express from 'express';
import * as fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getDatabaseService } from '../../services/databaseService.js';
import { getMobileCustomerService } from '../../services/mobileCustomerService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import { publicTenantMiddleware, mobileAuthMiddleware } from '../../middleware/mobileMiddleware.js';

const router = express.Router();
const db = getDatabaseService();

const productUploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.resolve(process.cwd(), 'uploads/product');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    },
});
const productUpload = multer({ storage: productUploadStorage });

console.log('✅ Mobile router initialized');

// ╔══════════════════════════════════════════════════════════════════╗
// ║  DISCOVERY — Find available shops (no auth, no slug needed)    ║
// ╚══════════════════════════════════════════════════════════════════╝

// Returns available shops for the landing page.
// If only one shop exists, the PWA auto-redirects to it.
router.get('/discover', async (_req: any, res) => {
    try {
        // Step 1: Try finding shops with mobile ordering enabled
        let shops: any[] = [];
        try {
            shops = await db.query(
                `SELECT t.slug, t.company_name, t.logo_url, t.brand_color
           FROM tenants t
           INNER JOIN mobile_ordering_settings m ON m.tenant_id = t.id AND m.is_enabled = TRUE
           WHERE t.slug IS NOT NULL
           ORDER BY t.company_name`
            );
        } catch {
            // mobile_ordering_settings table may not exist yet — that's OK
        }

        // Step 2: If no mobile-enabled shops found, show all tenants with slugs
        if (shops.length === 0) {
            try {
                shops = await db.query(
                    `SELECT slug, company_name, logo_url, brand_color FROM tenants WHERE slug IS NOT NULL ORDER BY company_name`
                );
            } catch {
                // slug column may not exist yet — try without it
                try {
                    const allTenants = await db.query(
                        `SELECT id, name, company_name FROM tenants ORDER BY company_name`
                    );
                    // Auto-generate slugs from company_name for display
                    shops = allTenants.map((t: any) => ({
                        slug: (t.company_name || t.name || t.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                        company_name: t.company_name || t.name,
                        logo_url: null,
                        brand_color: '#4F46E5',
                    }));
                } catch {
                    shops = [];
                }
            }
        }

        res.json({
            shops,
            redirect: shops.length === 1 ? shops[0].slug : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  PUBLIC ROUTES — No auth required (resolved via shop slug)      ║
// ╚══════════════════════════════════════════════════════════════════╝


// Shop info (branding, hours, settings)
router.get('/:shopSlug/info', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const settings = await getMobileCustomerService().getMobileSettings(req.tenantId);

        if (!settings.is_enabled) {
            return res.status(404).json({ error: 'Mobile ordering is not available for this shop.' });
        }

        // Prefer shop address/phone from tenant_branding (App Branding form) when set
        let address = req.shop.address ?? null;
        let phone = req.shop.phone ?? null;
        try {
            const { getShopService } = await import('../../services/shopService.js');
            const branding = await getShopService().getTenantBranding(req.tenantId);
            if (branding?.address) address = branding.address;
            // phone stays from tenants unless we add it to tenant_branding later
        } catch (_) { /* ignore */ }

        let branchName: string | null = null;
        if (req.branchId) {
            const branchRows = await db.query('SELECT name FROM shop_branches WHERE id = $1 AND tenant_id = $2', [req.branchId, req.tenantId]);
            branchName = branchRows[0]?.name ?? null;
        }

        res.json({
            shop: {
                name: req.shop.name,
                company_name: req.shop.company_name,
                logo_url: req.shop.logo_url,
                brand_color: req.shop.brand_color,
                slug: req.shop.slug,
                address: address ?? null,
                phone: phone ?? null,
                branchId: req.branchId ?? null,
                branchName: branchName ?? null,
            },
            settings: {
                minimum_order_amount: settings.minimum_order_amount,
                delivery_fee: settings.delivery_fee,
                free_delivery_above: settings.free_delivery_above,
                estimated_delivery_minutes: settings.estimated_delivery_minutes,
                order_acceptance_start: settings.order_acceptance_start,
                order_acceptance_end: settings.order_acceptance_end,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Branding
router.get('/:shopSlug/branding', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const { getShopService } = await import('../../services/shopService.js');
        const branding = await getShopService().getTenantBranding(req.tenantId);
        res.json(branding);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Categories
router.get('/:shopSlug/categories', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const categories = await getMobileOrderService().getCategoriesForMobile(req.tenantId);
        res.json(categories);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Brands
router.get('/:shopSlug/brands', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const brands = await getMobileOrderService().getBrandsForMobile(req.tenantId);
        res.json(brands);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Products (paginated)
router.get('/:shopSlug/products', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const {
            cursor, limit, search, category,
            categoryIds, subcategoryIds, brandIds,
            minPrice, maxPrice, availability,
            onSale, minRating, sortBy
        } = req.query;

        // Support both single 'category' and multiple 'categoryIds'
        let finalCategoryIds: string[] | undefined = undefined;
        if (categoryIds) {
            finalCategoryIds = Array.isArray(categoryIds) ? categoryIds : [categoryIds as string];
        } else if (category) {
            finalCategoryIds = [category as string];
        }

        const result = await getMobileOrderService().getProductsForMobile(req.tenantId, {
            cursor: cursor as string,
            limit: parseInt(limit as string) || 20,
            search: search as string,
            categoryIds: finalCategoryIds,
            subcategoryIds: subcategoryIds ? (Array.isArray(subcategoryIds) ? subcategoryIds : [subcategoryIds as string]) : undefined,
            brandIds: brandIds ? (Array.isArray(brandIds) ? brandIds : [brandIds as string]) : undefined,
            minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
            maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
            availability: availability as string,
            onSale: onSale === 'true',
            minRating: minRating ? parseFloat(minRating as string) : undefined,
            sortBy: sortBy as string,
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Product detail
router.get('/:shopSlug/products/:id', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const product = await getMobileOrderService().getProductDetailForMobile(req.tenantId, req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Upload product image (for syncing offline-created products with images to cloud)
router.post('/:shopSlug/upload-image', publicTenantMiddleware(db), productUpload.single('image'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = `/uploads/product/${req.file.filename}`;
    res.json({ imageUrl });
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUTH ROUTES — OTP request/verify                               ║
// ╚══════════════════════════════════════════════════════════════════╝

router.post('/auth/register', async (req: any, res) => {
    try {
        const { phone, password, name, addressLine1, shopSlug } = req.body;
        if (!phone || !password || !name || !addressLine1 || !shopSlug) {
            return res.status(400).json({ error: 'Phone, password, name, address, and shop are required' });
        }

        // Resolve tenant from slug
        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        const result = await getMobileCustomerService().register(shop.id, phone, name, addressLine1, password);
        res.json(result);
    } catch (error: any) {
        if (error.message === 'PHONE_ALREADY_REGISTERED') {
            return res.status(409).json({ error: 'This mobile number is already registered. Please login instead.' });
        }
        res.status(400).json({ error: error.message });
    }
});

router.post('/auth/login', async (req: any, res) => {
    try {
        const { phone, password, shopSlug } = req.body;
        if (!phone || !password || !shopSlug) {
            return res.status(400).json({ error: 'Phone, password, and shop are required' });
        }

        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        const result = await getMobileCustomerService().login(shop.id, phone, password);
        res.json(result);
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUTHENTICATED CUSTOMER ROUTES                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

// List branches for the current tenant (for switch branch in mobile app)
router.get('/branches', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getShopService } = await import('../../services/shopService.js');
        const tenantRows = await db.query('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
        const tenantSlug = tenantRows[0]?.slug ?? null;
        const branches = await getShopService().getBranches(req.tenantId);
        const list = branches.map((b: any, index: number) => ({
            id: b.id,
            name: b.name,
            code: b.code || undefined,
            slug: b.slug || (index === 0 && tenantSlug ? tenantSlug : null),
        }));
        res.json({ branches: list });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Profile
router.get('/profile', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const profile = await getMobileCustomerService().getProfile(req.tenantId, req.customerId);
        res.json(profile);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/profile', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const profile = await getMobileCustomerService().updateProfile(req.tenantId, req.customerId, req.body);
        res.json(profile);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Place order — shop and branch are the same entity: server uses tenant's default (first) branch when branchId omitted
router.post('/orders', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().placeOrder(req.tenantId, {
            customerId: req.customerId,
            branchId: req.body.branchId, // optional; when omitted, tenant's first branch is used (shop = branch)
            items: req.body.items,
            deliveryAddress: req.body.deliveryAddress,
            deliveryLat: req.body.deliveryLat,
            deliveryLng: req.body.deliveryLng,
            deliveryNotes: req.body.deliveryNotes,
            paymentMethod: req.body.paymentMethod,
            idempotencyKey: req.body.idempotencyKey,
        });

        if (result.duplicate) {
            return res.status(200).json({ ...result.order, duplicate: true, message: 'Order already placed' });
        }

        res.status(201).json(result.order);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Order history
router.get('/orders', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().getCustomerOrders(
            req.tenantId,
            req.customerId,
            req.query.cursor as string,
            parseInt(req.query.limit as string) || 20
        );
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Order detail
router.get('/orders/:id', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const order = await getMobileOrderService().getOrderDetail(req.tenantId, req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Ensure customer can only see their own order
        if (order.customer_id !== req.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(order);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel own order
router.post('/orders/:id/cancel', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().cancelByCustomer(
            req.tenantId, req.params.id, req.customerId, req.body.reason
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  BUDGET MANAGEMENT ROUTES                                       ║
// ╚══════════════════════════════════════════════════════════════════╝

// Get budgets list
router.get('/budgets', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const budgets = await getBudgetService().getBudgets(req.tenantId, req.customerId);
        res.json(budgets);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get budget detail inclusive items and actuals
router.get('/budgets/:id', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const budget = await getBudgetService().getBudgetDetail(req.tenantId, req.params.id);
        if (!budget) return res.status(404).json({ error: 'Budget not found' });
        if (budget.customer_id !== req.customerId) return res.status(403).json({ error: 'Access denied' });
        res.json(budget);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get current month summary
router.get('/budget-summary', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year as string) || (new Date().getFullYear());
        const summary = await getBudgetService().getMonthlySummary(req.tenantId, req.customerId, month, year);
        res.json(summary || { message: 'No budget found for this month' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create or update budget
router.post('/budgets', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const budget = await getBudgetService().createOrUpdateBudget(req.tenantId, req.customerId, req.body);
        res.status(201).json(budget);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Clone budget to another month
router.post('/budgets/:id/clone', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const { targetMonth, targetYear } = req.body;
        if (!targetMonth || !targetYear) throw new Error('targetMonth and targetYear are required');

        const budget = await getBudgetService().cloneBudget(
            req.tenantId,
            req.customerId,
            req.params.id,
            targetMonth,
            targetYear
        );
        res.json(budget);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
