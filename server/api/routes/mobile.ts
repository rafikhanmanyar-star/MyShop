import express from 'express';
import * as fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getDatabaseService } from '../../services/databaseService.js';
import { getMobileCustomerService } from '../../services/mobileCustomerService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import {
    effectiveBranchMaxDeliveryKm,
    tenantDefaultKmFromMobileSettings,
} from '../../services/mobileOrderBranchRouting.js';
import { getOfferService } from '../../services/offerService.js';
import { publicTenantMiddleware, mobileAuthMiddleware } from '../../middleware/mobileMiddleware.js';
import { mobileTenantGuard } from '../../middleware/mobileTenantGuard.js';
import { getCustomerIdentityService } from '../../services/customerIdentityService.js';
import { getRecipeService } from '../../services/recipeService.js';
import { getWeeklyMenuPlannerService } from '../../services/weeklyMenuPlannerService.js';
import { getMobileSearchService } from '../../services/mobileSearchService.js';
import jwt from 'jsonwebtoken';

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
// ║  Customer-wide SSE — order / delivery updates for notifications  ║
// ╚══════════════════════════════════════════════════════════════════╝
// Must be registered before `/:shopSlug/*` routes. Filters PG NOTIFY by tenant + customer.
router.get('/notifications/stream', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', customerId: req.customerId })}\n\n`);

        const heartbeat = setInterval(() => {
            res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
        }, 30000);

        const pool = db.getPool();
        let pgClient: any = null;

        const forwardIfCustomerOrder = async (payload: any) => {
            if (!payload || payload.tenantId !== req.tenantId || !payload.orderId) return;
            let belongs = false;
            if (payload.customerId && payload.customerId === req.customerId) {
                belongs = true;
            } else {
                const rows = await db.query(
                    'SELECT customer_id FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
                    [payload.orderId, req.tenantId]
                );
                belongs = rows[0]?.customer_id === req.customerId;
            }
            if (!belongs) return;
            res.write(`data: ${JSON.stringify({ type: 'order_event', payload })}\n\n`);
        };

        if (pool) {
            try {
                pgClient = await pool.connect();
                await pgClient.query('LISTEN mobile_order_updated');
                await pgClient.query('LISTEN new_mobile_order');
                pgClient.on('notification', (msg: any) => {
                    if (msg.channel !== 'mobile_order_updated' && msg.channel !== 'new_mobile_order') return;
                    try {
                        const payload = JSON.parse(msg.payload);
                        void forwardIfCustomerOrder(payload).catch((e) => {
                            console.error('[mobile notifications SSE] forward error:', e);
                        });
                    } catch (e) {
                        console.error('[mobile notifications SSE] parse error:', e);
                    }
                });
            } catch (err) {
                console.error('[mobile notifications SSE] LISTEN error:', err);
            }
        }

        req.on('close', () => {
            clearInterval(heartbeat);
            if (pgClient) {
                pgClient.query('UNLISTEN mobile_order_updated').catch(() => {});
                pgClient.query('UNLISTEN new_mobile_order').catch(() => {});
                pgClient.release();
            }
        });
    } catch (error: any) {
        console.error('[mobile notifications SSE]', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Stream failed' });
        }
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  PUBLIC ROUTES — No auth required (resolved via shop slug)      ║
// ╚══════════════════════════════════════════════════════════════════╝

// Recipes (saved list must be registered before /recipes/:id)
router.get('/:shopSlug/recipes/saved', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const data = await getRecipeService().listSavedRecipes(req.tenantId, req.customerId, { limit, offset });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:shopSlug/recipes', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const {
            category_id,
            search,
            trending,
            featured,
            quick,
            budget,
            limit,
            offset,
        } = req.query;
        const data = await getRecipeService().listMobileRecipes(req.tenantId, {
            category_id: category_id as string,
            search: search as string,
            trending: trending === 'true',
            featured: featured === 'true',
            quick: quick === 'true',
            budget: budget === 'true',
            limit: limit ? parseInt(limit as string, 10) : undefined,
            offset: offset ? parseInt(offset as string, 10) : undefined,
        });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:shopSlug/recipes/:id', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')?.trim();
        let customerId: string | null = null;
        if (token && process.env.JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
                if (decoded?.type === 'mobile_customer' && decoded.tenantId === req.tenantId) {
                    customerId = decoded.customerId;
                }
            } catch {
                /* optional auth */
            }
        }
        const data = await getRecipeService().getMobileRecipeDetail(req.tenantId, req.params.id, customerId);
        if (!data) return res.status(404).json({ error: 'Recipe not found' });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:shopSlug/recipes/:id/generate-cart', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const servingsRaw = (req.body as any)?.servings;
        const servings =
            servingsRaw !== undefined && servingsRaw !== null ? parseFloat(String(servingsRaw)) : undefined;
        const items = await getRecipeService().generateCartForRecipe(
            req.tenantId,
            req.params.id,
            servings !== undefined && Number.isFinite(servings) && servings > 0 ? servings : undefined
        );
        res.json({
            items: items.map((row) => ({
                product_id: row.product_id,
                product_name: row.product_name,
                quantity: row.quantity,
                sku: row.sku,
                price: row.price,
                tax_rate: row.tax_rate,
                image_url: row.image_url,
                available_stock: row.available_stock,
            })),
        });
    } catch (e: any) {
        const msg = String(e?.message || '');
        const status = /not found|not available|No ingredients/i.test(msg) ? 400 : 500;
        res.status(status).json({ error: msg });
    }
});

router.post('/:shopSlug/recipes/:id/save', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getRecipeService().saveRecipeForUser(req.tenantId, req.customerId, req.params.id);
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.delete('/:shopSlug/recipes/:id/save', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getRecipeService().unsaveRecipeForUser(req.tenantId, req.customerId, req.params.id);
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:shopSlug/recipe-categories', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const list = await getRecipeService().listCategories(req.tenantId);
        res.json(list);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Weekly menu planner (auth + tenant from shop slug)               ║
// ╚══════════════════════════════════════════════════════════════════╝

router.post('/:shopSlug/weekly-menus', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { title, week_start_date } = req.body || {};
        const id = await getWeeklyMenuPlannerService().createMenu(req.tenantId, req.customerId, {
            title,
            week_start_date,
        });
        res.status(201).json({ id });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/:shopSlug/weekly-menus', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
        const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
        const week_start_date = req.query.week_start_date ? String(req.query.week_start_date) : undefined;
        const data = await getWeeklyMenuPlannerService().listMenus(req.tenantId, req.customerId, {
            week_start_date,
            limit,
            offset,
        });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:shopSlug/weekly-menus/:menuId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const data = await getWeeklyMenuPlannerService().getMenuDetail(req.tenantId, req.customerId, req.params.menuId);
        res.json(data);
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.put('/:shopSlug/weekly-menus/:menuId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().updateMenu(req.tenantId, req.customerId, req.params.menuId, req.body || {});
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.delete('/:shopSlug/weekly-menus/:menuId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().softDeleteMenu(req.tenantId, req.customerId, req.params.menuId);
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.post('/:shopSlug/weekly-menus/:menuId/duplicate', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const week_start_date = String((req.body || {}).week_start_date || '');
        const id = await getWeeklyMenuPlannerService().duplicateMenu(
            req.tenantId,
            req.customerId,
            req.params.menuId,
            week_start_date
        );
        res.status(201).json({ id });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.post('/:shopSlug/weekly-menus/:menuId/items', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const id = await getWeeklyMenuPlannerService().addMenuItem(req.tenantId, req.customerId, req.params.menuId, req.body || {});
        res.status(201).json({ id });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.put('/:shopSlug/menu-items/:itemId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().updateMenuItem(req.tenantId, req.customerId, req.params.itemId, req.body || {});
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.delete('/:shopSlug/menu-items/:itemId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().deleteMenuItem(req.tenantId, req.customerId, req.params.itemId);
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.patch('/:shopSlug/menu-items/:itemId/move', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().moveMenuItem(req.tenantId, req.customerId, req.params.itemId, req.body || {});
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.post('/:shopSlug/weekly-menus/:menuId/generate-shopping-list', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const id = await getWeeklyMenuPlannerService().generateShoppingList(req.tenantId, req.customerId, req.params.menuId);
        res.status(201).json({ id });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(/not found/i.test(msg) ? 404 : /No meal|No ingredient|weekly calendar/i.test(msg) ? 400 : 500).json({ error: msg });
    }
});

router.get('/:shopSlug/customer-menu-items', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const list = await getWeeklyMenuPlannerService().listCustomerMenuItems(req.tenantId, req.customerId);
        res.json({ items: list });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:shopSlug/customer-menu-items', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const id = await getWeeklyMenuPlannerService().createCustomerMenuItem(
            req.tenantId,
            req.customerId,
            req.body || {}
        );
        res.status(201).json({ id });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.delete('/:shopSlug/customer-menu-items/:itemId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().deleteCustomerMenuItem(
            req.tenantId,
            req.customerId,
            req.params.itemId
        );
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.get('/:shopSlug/shopping-lists/:listId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const data = await getWeeklyMenuPlannerService().getShoppingListDetail(
            req.tenantId,
            req.customerId,
            req.params.listId
        );
        res.json(data);
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.get(
    '/:shopSlug/shopping-lists/:listId/external-market-list',
    publicTenantMiddleware(db),
    mobileAuthMiddleware(db),
    async (req: any, res) => {
        try {
            const data = await getWeeklyMenuPlannerService().getExternalMarketListForExport(
                req.tenantId,
                req.customerId,
                req.params.listId
            );
            const accept = String(req.headers.accept || '');
            if (accept.includes('text/plain')) {
                const body = data.lines
                    .map((l: { ingredient_name: string; quantity: number; unit: string }) => {
                        const u = l.unit ? String(l.unit) : '';
                        return `${l.ingredient_name} — ${l.quantity}${u ? ` ${u}` : ''}`;
                    })
                    .join('\n');
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.send(body || '');
            }
            res.json(data);
        } catch (e: any) {
            const msg = String(e?.message || '');
            res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
        }
    }
);

router.patch('/:shopSlug/shopping-lists/:listId/items/:itemId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        await getWeeklyMenuPlannerService().patchShoppingListItem(
            req.tenantId,
            req.customerId,
            req.params.listId,
            req.params.itemId,
            req.body || {}
        );
        res.json({ ok: true });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.post('/:shopSlug/shopping-lists/:listId/add-to-cart', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { all: allFlag, item_ids } = req.body || {};
        const data = await getWeeklyMenuPlannerService().addShoppingListToCart(
            req.tenantId,
            req.customerId,
            req.params.listId,
            { all: Boolean(allFlag), item_ids: Array.isArray(item_ids) ? item_ids : undefined }
        );
        res.json(data);
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.get('/:shopSlug/menu-templates', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const list = await getWeeklyMenuPlannerService().listTemplates(req.tenantId, req.customerId);
        res.json({ items: list });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:shopSlug/menu-templates/from-menu/:menuId', publicTenantMiddleware(db), mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { name, visibility } = req.body || {};
        const id = await getWeeklyMenuPlannerService().createTemplateFromMenu(
            req.tenantId,
            req.customerId,
            req.params.menuId,
            name,
            visibility === 'public' ? 'public' : 'private'
        );
        res.status(201).json({ id });
    } catch (e: any) {
        const msg = String(e?.message || '');
        res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
    }
});

router.post(
    '/:shopSlug/weekly-menus/:menuId/apply-template/:templateId',
    publicTenantMiddleware(db),
    mobileAuthMiddleware(db),
    async (req: any, res) => {
        try {
            await getWeeklyMenuPlannerService().applyTemplate(
                req.tenantId,
                req.customerId,
                req.params.menuId,
                req.params.templateId
            );
            res.json({ ok: true });
        } catch (e: any) {
            const msg = String(e?.message || '');
            res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
        }
    }
);

// Public: whether mobile signup requires SMS OTP (for app UX)
router.get('/:shopSlug/signup-otp-config', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const signup_otp_required = await getMobileCustomerService().signupOtpEnabledForTenant(req.tenantId);
        res.json({ signup_otp_required });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Voice order public config (cart page, no login required to view UI)
router.get('/:shopSlug/voice-order-config', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const { getVoiceOrderService } = await import('../../services/voiceOrderService.js');
        const enabled = await getVoiceOrderService().isVoiceOrderingEnabled(req.tenantId);
        const vs = await getVoiceOrderService().getSettings(req.tenantId);
        res.json({
            enabled,
            maxRecordingSeconds: vs.max_recording_seconds,
            maxUploadBytes: vs.max_upload_bytes,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Shop info (branding, hours, settings)
router.get('/:shopSlug/info', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const settings = await getMobileCustomerService().getMobileSettings(req.tenantId);
        const { getVoiceOrderService } = await import('../../services/voiceOrderService.js');
        const voiceEnabled = await getVoiceOrderService().isVoiceOrderingEnabled(req.tenantId);
        const voiceSettings = await getVoiceOrderService().getSettings(req.tenantId);

        if (!settings.is_enabled) {
            return res.status(404).json({ error: 'Mobile ordering is not available for this shop.' });
        }

        // Prefer shop address / logo from tenant_branding (Mobile App Branding) when set; fallback to tenants row
        let address = req.shop.address ?? null;
        let phone = req.shop.phone ?? null;
        let logoUrl = req.shop.logo_url ?? null;
        try {
            const { getShopService } = await import('../../services/shopService.js');
            const branding = await getShopService().getTenantBranding(req.tenantId);
            if (branding?.address) address = branding.address;
            if (branding?.logo_url) logoUrl = branding.logo_url;
            // phone stays from tenants unless we add it to tenant_branding later
        } catch (_) { /* ignore */ }

        let branchName: string | null = null;
        let delivery_area: {
            branch_latitude: number;
            branch_longitude: number;
            max_delivery_km: number;
        } | null = null;

        const tenantDefaultKm = tenantDefaultKmFromMobileSettings(settings.max_delivery_radius_km);

        if (req.branchId) {
            const branchRows = await db.query('SELECT name FROM shop_branches WHERE id = $1 AND tenant_id = $2', [req.branchId, req.tenantId]);
            branchName = branchRows[0]?.name ?? null;

            const geoRows = await db.query(
                `SELECT latitude, longitude, max_delivery_distance_km FROM shop_branches
                 WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
                [req.branchId, req.tenantId]
            );
            if (geoRows.length > 0) {
                const blat = parseFloat(geoRows[0].latitude);
                const blng = parseFloat(geoRows[0].longitude);
                if (Number.isFinite(blat) && Number.isFinite(blng)) {
                    const maxKm = effectiveBranchMaxDeliveryKm(geoRows[0].max_delivery_distance_km, tenantDefaultKm);
                    delivery_area = {
                        branch_latitude: blat,
                        branch_longitude: blng,
                        max_delivery_km: maxKm,
                    };
                }
            }
        }

        res.json({
            shop: {
                id: req.tenantId,
                name: req.shop.name,
                company_name: req.shop.company_name,
                logo_url: logoUrl,
                brand_color: req.shop.brand_color,
                slug: req.shop.slug,
                address: address ?? null,
                phone: phone ?? null,
                branchId: req.branchId ?? null,
                branchName: branchName ?? null,
                delivery_area,
            },
            settings: {
                minimum_order_amount: settings.minimum_order_amount,
                delivery_fee: settings.delivery_fee,
                free_delivery_above: settings.free_delivery_above,
                estimated_delivery_minutes: settings.estimated_delivery_minutes,
                order_acceptance_start: settings.order_acceptance_start,
                order_acceptance_end: settings.order_acceptance_end,
                offer_stacking_mode: settings.offer_stacking_mode === 'stack' ? 'stack' : 'best',
                voice_ordering_enabled: voiceEnabled,
                max_voice_recording_seconds: voiceSettings.max_recording_seconds,
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
        const mergedLogo = branding?.logo_url || req.shop?.logo_url || null;
        res.json({ ...branding, logo_url: mergedLogo });
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

// ─── Search (suggestions, trending, analytics, discovery) — before /products for clarity ───
router.get('/:shopSlug/search/suggestions', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const q = String(req.query.q || '');
        let recentList: string[] = [];
        const recentParam = req.query.recent;
        if (typeof recentParam === 'string' && recentParam.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(recentParam) as unknown;
                if (Array.isArray(parsed)) recentList = parsed.map(String).filter(Boolean);
            } catch {
                recentList = [];
            }
        } else {
            const rp = recentParam;
            recentList = Array.isArray(rp) ? rp.map(String) : rp ? [String(rp)] : [];
        }
        const out = await getMobileSearchService().getSuggestions(req.tenantId, q, recentList);
        res.json(out);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:shopSlug/search/trending', publicTenantMiddleware(db), async (_req: any, res) => {
    try {
        const keywords = await getMobileSearchService().getTrendingTerms(_req.tenantId);
        res.json({ keywords });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/:shopSlug/search/analytics', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const { eventType, keyword, productId, meta, sessionId } = req.body || {};
        if (!eventType || typeof eventType !== 'string') {
            return res.status(400).json({ error: 'eventType is required' });
        }
        await getMobileSearchService().recordSearchEvent({
            tenantId: req.tenantId,
            customerId: null,
            sessionId: sessionId != null ? String(sessionId) : null,
            eventType: String(eventType),
            keyword: keyword != null ? String(keyword) : null,
            productId: productId != null ? String(productId) : null,
            meta: meta && typeof meta === 'object' ? meta : {},
        });
        res.json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:shopSlug/search/recommendations', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 24);
        const [similar, best, categories] = await Promise.all([
            q
                ? getMobileOrderService().getProductsForMobile(req.tenantId, {
                      limit,
                      search: q,
                      sortBy: 'best_selling',
                  })
                : Promise.resolve({ items: [] as any[] }),
            getMobileOrderService().getProductsForMobile(req.tenantId, {
                limit: Math.max(limit, 8),
                sortBy: 'best_selling',
            }),
            getMobileOrderService().getCategoriesForMobile(req.tenantId),
        ]);
        const catList = Array.isArray(categories) ? categories : (categories as any)?.categories ?? [];
        const mains = (catList as any[]).filter((c) => !c.parent_id).slice(0, 8);
        res.json({
            similar: similar.items || [],
            recommended: best.items || [],
            categories: mains,
            spellSuggestions: [],
        });
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
            onSale, minRating, sortBy,
            page, searchPage,
            showUnavailable,
            filterInStock,
            filterPopular,
            filterLowPrice,
            lowPriceMax,
            deals,
            color, size,
            minDiscount, maxDiscount,
        } = req.query;

        // Support both single 'category' and multiple 'categoryIds'
        let finalCategoryIds: string[] | undefined = undefined;
        if (categoryIds) {
            finalCategoryIds = Array.isArray(categoryIds) ? categoryIds : [categoryIds as string];
        } else if (category) {
            finalCategoryIds = [category as string];
        }

        const pageNum = page ? parseInt(page as string, 10) : undefined;
        const searchPageNum = searchPage ? parseInt(searchPage as string, 10) : undefined;
        const result = await getMobileOrderService().getProductsForMobile(req.tenantId, {
            cursor: cursor as string,
            page: pageNum && pageNum > 0 ? pageNum : undefined,
            searchPage: searchPageNum && searchPageNum > 0 ? searchPageNum : undefined,
            limit: parseInt(limit as string) || 20,
            search: search as string,
            categoryIds: finalCategoryIds,
            subcategoryIds: subcategoryIds ? (Array.isArray(subcategoryIds) ? subcategoryIds : [subcategoryIds as string]) : undefined,
            brandIds: brandIds ? (Array.isArray(brandIds) ? brandIds : [brandIds as string]) : undefined,
            minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
            maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
            availability: availability as string,
            onSale: onSale === 'true' || deals === 'true',
            minRating: minRating ? parseFloat(minRating as string) : undefined,
            sortBy: sortBy as string,
            showUnavailable: showUnavailable === 'true',
            filterInStock: filterInStock === 'true',
            filterPopular: filterPopular === 'true',
            filterLowPrice: filterLowPrice === 'true',
            lowPriceMax: lowPriceMax ? parseFloat(lowPriceMax as string) : undefined,
            color: color ? String(color) : undefined,
            size: size ? String(size) : undefined,
            minDiscount: minDiscount ? parseFloat(minDiscount as string) : undefined,
            maxDiscount: maxDiscount ? parseFloat(maxDiscount as string) : undefined,
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Offers (active promotions)
router.get('/:shopSlug/offers', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const offers = await getOfferService().listActiveOffersForMobile(req.tenantId);
        res.json(offers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:shopSlug/offers/:id', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const offer = await getOfferService().getOfferDetailForMobile(req.tenantId, req.params.id);
        if (!offer) return res.status(404).json({ error: 'Offer not found' });
        res.json(offer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Product recommendations (related sellable products) — register before /products/:id
router.get('/:shopSlug/products/:id/recommendations', publicTenantMiddleware(db), async (req: any, res) => {
    try {
        const items = await getMobileOrderService().getProductRecommendationsForMobile(req.tenantId, req.params.id, 6);
        res.json({ items });
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

        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        if (await getMobileCustomerService().signupOtpEnabledForTenant(shop.id)) {
            return res.status(400).json({
                error: 'This shop verifies new registrations by SMS. Request a code first, then enter it to complete signup.',
                code: 'SIGNUP_OTP_REQUIRED',
            });
        }

        const result = await getMobileCustomerService().register(shop.id, phone, name, addressLine1, password);
        res.json(result);
    } catch (error: any) {
        if (error.message === 'PHONE_ALREADY_REGISTERED') {
            return res.status(409).json({ error: 'This mobile number is already registered. Please login instead.' });
        }
        const msg = String(error?.message || '');
        if (msg.includes('Password must') || msg.includes('letters and digits')) {
            return res.status(400).json({ error: msg });
        }
        res.status(400).json({ error: error.message });
    }
});

router.post('/auth/register-request', async (req: any, res) => {
    try {
        const { phone, password, name, addressLine1, shopSlug } = req.body;
        if (!phone || !password || !name || !addressLine1 || !shopSlug) {
            return res.status(400).json({ error: 'Phone, password, name, address, and shop are required' });
        }

        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        const label = shop.company_name || shop.name || 'Shop';
        const out = await getMobileCustomerService().requestSignupOtp(shop.id, phone, name, addressLine1, password, label);
        res.json(out);
    } catch (error: any) {
        if (error.message === 'PHONE_ALREADY_REGISTERED') {
            return res.status(409).json({ error: 'This mobile number is already registered. Please login instead.' });
        }
        const msg = String(error?.message || '');
        if (msg === 'SIGNUP_OTP_NOT_CONFIGURED') {
            return res.status(400).json({
                error: 'SMS signup is not configured for this shop. Ask the shop to enable it in POS settings.',
                code: 'SIGNUP_OTP_NOT_CONFIGURED',
            });
        }
        if (msg === 'OTP_RATE_LIMIT') {
            return res.status(429).json({ error: 'Please wait about a minute before requesting another code.' });
        }
        if (msg.includes('Password must') || msg.includes('letters and digits')) {
            return res.status(400).json({ error: msg });
        }
        if (msg.includes('Twilio SMS failed')) {
            return res.status(502).json({ error: msg });
        }
        res.status(400).json({ error: msg || 'Could not send verification code.' });
    }
});

router.post('/auth/register-verify', async (req: any, res) => {
    try {
        const { phone, shopSlug, otp } = req.body;
        if (!phone || !shopSlug || otp === undefined || otp === null || String(otp).trim() === '') {
            return res.status(400).json({ error: 'Phone, shop, and OTP code are required' });
        }

        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        const result = await getMobileCustomerService().verifySignupOtpAndRegister(shop.id, phone, String(otp));
        res.json(result);
    } catch (error: any) {
        const msg = String(error?.message || '');
        if (msg === 'INVALID_OTP') {
            return res.status(400).json({ error: 'Invalid verification code. Try again.' });
        }
        if (msg === 'OTP_EXPIRED') {
            return res.status(400).json({ error: 'Code expired. Request a new one.' });
        }
        if (msg === 'NO_PENDING_SIGNUP') {
            return res.status(400).json({ error: 'No pending signup for this number. Request a new code.' });
        }
        if (msg === 'OTP_TOO_MANY_ATTEMPTS') {
            return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
        }
        if (msg === 'PHONE_ALREADY_REGISTERED') {
            return res.status(409).json({ error: 'This mobile number is already registered. Please login instead.' });
        }
        res.status(400).json({ error: msg || 'Verification failed.' });
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
        const msg = String(error?.message || '');
        const generic = msg.includes('blocked') ? msg : 'Invalid phone number or password';
        res.status(401).json({ error: generic });
    }
});

router.post('/auth/forgot-password', async (req: any, res) => {
    try {
        const { phone, shopSlug } = req.body;
        if (!phone || !shopSlug) {
            return res.status(400).json({ error: 'Phone and shop are required' });
        }
        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });
        const e164 = getCustomerIdentityService().normalizeInputToE164(phone);
        if (!e164) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }
        try {
            await getCustomerIdentityService().requestPasswordReset(shop.id, e164);
        } catch {
            // Do not reveal whether the number is registered
        }
        res.json({
            ok: true,
            message: 'If an account exists for this number, the shop will receive a reset request.',
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/auth/change-password', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { oldPassword, newPassword } = req.body || {};
        if (oldPassword === undefined || newPassword === undefined) {
            return res.status(400).json({ error: 'oldPassword and newPassword are required' });
        }
        await getMobileCustomerService().changePassword(
            req.tenantId,
            req.customerId,
            String(oldPassword),
            String(newPassword)
        );
        res.json({ ok: true });
    } catch (error: any) {
        res.status(400).json({ error: String(error?.message || 'Could not change password') });
    }
});

// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUTHENTICATED CUSTOMER ROUTES                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

// List branches for the current tenant (for switch branch in mobile app)
router.get('/branches', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const tenantRows = await db.query('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
        const tenantSlug = tenantRows[0]?.slug ?? null;

        // Query active branches directly — avoid getBranches() which auto-creates
        // a placeholder "Main Store" when none exist (meant for admin bootstrap only).
        const branches = await db.query(
            `SELECT * FROM shop_branches
             WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
             ORDER BY name ASC`,
            [req.tenantId]
        );

        const list = branches.map((b: any) => {
            let slug = b.slug || null;
            if (!slug && tenantSlug) {
                slug = branches.length === 1
                    ? tenantSlug
                    : `${tenantSlug}-${(b.code || b.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            }
            return {
                id: b.id,
                name: b.name,
                code: b.code || undefined,
                slug,
                address: b.address || b.location || null,
                latitude: b.latitude != null ? parseFloat(b.latitude) : null,
                longitude: b.longitude != null ? parseFloat(b.longitude) : null,
            };
        });
        res.json({ branches: list });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Heartbeat: mobile PWA reports activity (page, cart size) ─────────
router.post('/heartbeat', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { currentPage, cartItemCount, cartTotal } = req.body;
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
        const ua = req.headers['user-agent'] || null;
        await db.execute(
            `INSERT INTO mobile_customer_heartbeats (id, tenant_id, customer_id, last_seen_at, current_page, cart_item_count, cart_total, ip_address, user_agent)
             VALUES (uuid_generate_v4()::text, $1, $2, NOW(), $3, $4, $5, $6, $7)
             ON CONFLICT (tenant_id, customer_id) DO UPDATE
             SET last_seen_at = NOW(),
                 current_page = COALESCE($3, mobile_customer_heartbeats.current_page),
                 cart_item_count = COALESCE($4, mobile_customer_heartbeats.cart_item_count),
                 cart_total = COALESCE($5, mobile_customer_heartbeats.cart_total),
                 ip_address = COALESCE($6, mobile_customer_heartbeats.ip_address),
                 user_agent = COALESCE($7, mobile_customer_heartbeats.user_agent)`,
            [req.tenantId, req.customerId, currentPage || null, cartItemCount ?? 0, cartTotal ?? 0, ip, ua]
        );
        res.json({ ok: true });
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

// Past delivery locations for checkout quick-pick (from order history)
router.get('/delivery-address-suggestions', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const raw = req.query?.limit;
        const limit = raw != null ? parseInt(String(raw), 10) : 12;
        const suggestions = await getMobileCustomerService().listDeliveryAddressSuggestions(
            req.tenantId,
            req.customerId,
            Number.isFinite(limit) ? limit : 12
        );
        res.json({ suggestions });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Loyalty points (same balance as POS; value uses shop redemption ratio)
const loyaltyPointsHandler = async (req: any, res: express.Response) => {
    try {
        const { getShopService } = await import('../../services/shopService.js');
        const data = await getShopService().getLoyaltyPointsForMobileCustomer(req.tenantId, req.customerId);
        res.json(data);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
router.get('/loyalty-points', mobileAuthMiddleware(db), loyaltyPointsHandler);
router.get('/user/loyalty-points', mobileAuthMiddleware(db), loyaltyPointsHandler);

router.get('/loyalty-history', mobileAuthMiddleware(db), async (req: any, res: express.Response) => {
    try {
        const { getShopService } = await import('../../services/shopService.js');
        const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 50;
        const items = await getShopService().getLoyaltyHistoryForMobileCustomer(
            req.tenantId,
            req.customerId,
            limit
        );
        res.json({ items });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Place order — shop and branch are the same entity: server uses tenant's default (first) branch when branchId omitted
router.post('/orders', mobileAuthMiddleware(db), mobileTenantGuard(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().placeOrder(req.tenantId, {
            customerId: req.customerId,
            branchId: req.body.branchId, // optional; when omitted, tenant's first branch is used (shop = branch)
            items: req.body.items,
            offerBundles: req.body.offerBundles,
            deliveryAddress: req.body.deliveryAddress,
            deliveryLat: req.body.deliveryLat,
            deliveryLng: req.body.deliveryLng,
            deliveryNotes: req.body.deliveryNotes,
            paymentMethod: req.body.paymentMethod,
            idempotencyKey: req.body.idempotencyKey,
            scheduledDeliveryAt: req.body.scheduledDeliveryAt,
        });

        if (result.duplicate) {
            return res.status(200).json({ ...result.order, duplicate: true, message: 'Order already placed' });
        }

        res.status(201).json(result.order);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/** Validates cart + branch routing + schedule rules without reserving inventory (same demand as POST /orders). */
router.post('/orders/checkout-preflight', mobileAuthMiddleware(db), mobileTenantGuard(db), async (req: any, res) => {
    try {
        await getMobileOrderService().preflightCheckout(req.tenantId, {
            customerId: req.customerId,
            branchId: req.body.branchId,
            items: req.body.items,
            offerBundles: req.body.offerBundles,
            deliveryAddress: req.body.deliveryAddress,
            deliveryLat: req.body.deliveryLat,
            deliveryLng: req.body.deliveryLng,
            deliveryNotes: req.body.deliveryNotes,
            paymentMethod: req.body.paymentMethod,
            scheduledDeliveryAt: req.body.scheduledDeliveryAt,
        });
        res.json({ ok: true });
    } catch (error: any) {
        res.json({ ok: false, error: error.message || 'Checkout validation failed' });
    }
});

// ─── Stages 10–11: SSE — customer stream; Stage 11 also feeds POS + rider streams (same NOTIFY) ───
router.get('/orders/:id/stream', mobileAuthMiddleware(db), async (req: any, res) => {
    const orderId = req.params.id;
    try {
        const own = await db.query(
            'SELECT customer_id FROM mobile_orders WHERE id = $1 AND tenant_id = $2',
            [orderId, req.tenantId]
        );
        if (own.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        if (own[0].customer_id !== req.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', orderId })}\n\n`);

        const heartbeat = setInterval(() => {
            res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
        }, 30000);

        const pool = db.getPool();
        let pgClient: any = null;

        if (pool) {
            try {
                pgClient = await pool.connect();
                await pgClient.query('LISTEN mobile_order_updated');
                pgClient.on('notification', (msg: any) => {
                    try {
                        const payload = JSON.parse(msg.payload);
                        if (payload.orderId === orderId && payload.tenantId === req.tenantId) {
                            res.write(`data: ${JSON.stringify({ type: 'order_updated', ...payload })}\n\n`);
                        }
                    } catch (e) {
                        console.error('[mobile SSE] notification parse error:', e);
                    }
                });
            } catch (err) {
                console.error('[mobile SSE] LISTEN error:', err);
            }
        }

        req.on('close', () => {
            clearInterval(heartbeat);
            if (pgClient) {
                pgClient.query('UNLISTEN mobile_order_updated').catch(() => {});
                pgClient.release();
            }
        });
    } catch (error: any) {
        console.error('[mobile SSE]', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Stream failed' });
        }
    }
});

// Driving ETA (Google Directions; rate-limited server-side). Must be before /orders/:id
router.get('/orders/:id/delivery-eta', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const result = await getMobileOrderService().getDeliveryEtaForCustomerOrder(
            req.tenantId,
            req.params.id,
            req.customerId
        );
        if ('error' in result && result.error === 'not_found') {
            return res.status(404).json({ error: 'Order not found' });
        }
        if ('error' in result && result.error === 'forbidden') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Order history (cart + voice awaiting invoice + delivery orders)
router.get('/orders', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getVoiceOrderService } = await import('../../services/voiceOrderService.js');
        const result = await getVoiceOrderService().getCustomerOrderFeed(
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

// Delivery chat (customer ↔ rider / shop)
router.get('/orders/:id/chat', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getDeliveryChatService } = await import('../../services/deliveryChatService.js');
        const messages = await getDeliveryChatService().listMessages(
            req.tenantId,
            req.params.id,
            100,
            { customerId: req.customerId }
        );
        res.json({ messages });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/orders/:id/chat', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { body } = req.body;
        const { getDeliveryChatService } = await import('../../services/deliveryChatService.js');
        const msg = await getDeliveryChatService().sendMessage(
            req.tenantId,
            req.params.id,
            'customer',
            req.customerId,
            body,
            { customerId: req.customerId }
        );
        res.json(msg);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/orders/chat-threads', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getDeliveryChatService } = await import('../../services/deliveryChatService.js');
        const threads = await getDeliveryChatService().listThreadsForCustomer(
            req.tenantId,
            req.customerId
        );
        res.json({ threads });
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

// Auto-suggest budget based on last month's purchases
router.get('/budget-suggestions', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year as string) || (new Date().getFullYear());
        const result = await getBudgetService().getAutoSuggestedBudget(req.tenantId, req.customerId, month, year);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Budget alerts / notifications
router.get('/budget-alerts', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { getBudgetService } = await import('../../services/budgetService.js');
        const result = await getBudgetService().getBudgetAlerts(req.tenantId, req.customerId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
