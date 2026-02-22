import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { getMobileCustomerService } from '../../services/mobileCustomerService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import { publicTenantMiddleware, mobileAuthMiddleware } from '../../middleware/mobileMiddleware.js';

const router = express.Router();
const db = getDatabaseService();

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

        res.json({
            shop: {
                name: req.shop.name,
                company_name: req.shop.company_name,
                logo_url: req.shop.logo_url,
                brand_color: req.shop.brand_color,
                slug: req.shop.slug,
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

// Categories
router.get('/:shopSlug/categories', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const categories = await getMobileOrderService().getCategoriesForMobile(req.tenantId);
        res.json(categories);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Products (paginated)
router.get('/:shopSlug/products', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().getProductsForMobile(req.tenantId, {
            cursor: req.query.cursor as string,
            limit: parseInt(req.query.limit as string) || 20,
            categoryId: req.query.category as string,
            search: req.query.search as string,
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

// Place order
router.post('/orders', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().placeOrder(req.tenantId, {
            customerId: req.customerId,
            branchId: req.body.branchId,
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

export default router;
