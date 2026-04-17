import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import { getMobileCustomerService } from '../../services/mobileCustomerService.js';
import { getCustomerIdentityService } from '../../services/customerIdentityService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

console.log('✅ Mobile-orders POS router initialized');

// ════════════════════════════════════════════════════════════════════
// ⚠️ IMPORTANT: All named routes MUST be declared BEFORE the /:id
//    wildcard route, otherwise Express will match "settings" etc as IDs.
// ════════════════════════════════════════════════════════════════════

// ─── SSE: Real-time order stream for POS (Stage 11: + order/delivery status updates) ───
router.get('/stream', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    const tenantId = req.tenantId;

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial heartbeat
    res.write(`data: ${JSON.stringify({ type: 'connected', tenantId })}\n\n`);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    // Listen for PostgreSQL NOTIFY events
    const db = getDatabaseService();
    const pool = db.getPool();
    let pgClient: any = null;

    if (pool) {
        try {
            pgClient = await pool.connect();
            await pgClient.query('LISTEN new_mobile_order');
            await pgClient.query('LISTEN mobile_order_updated');
            await pgClient.query('LISTEN password_reset_request');
            await pgClient.query('LISTEN mobile_user_activity');

            pgClient.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    if (payload.tenantId !== tenantId) return;

                    if (msg.channel === 'new_mobile_order') {
                        res.write(`data: ${JSON.stringify({ type: 'new_order', ...payload })}\n\n`);
                    } else if (msg.channel === 'mobile_order_updated') {
                        res.write(`data: ${JSON.stringify({ type: 'order_updated', ...payload })}\n\n`);
                    } else if (msg.channel === 'password_reset_request') {
                        res.write(`data: ${JSON.stringify({ type: 'password_reset_request', ...payload })}\n\n`);
                    } else if (msg.channel === 'mobile_user_activity') {
                        res.write(`data: ${JSON.stringify({ type: 'mobile_user_activity', ...payload })}\n\n`);
                    }
                } catch (err) {
                    console.error('SSE notification parse error:', err);
                }
            });
        } catch (err) {
            console.error('SSE pg LISTEN error:', err);
        }
    }

    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        if (pgClient) {
            pgClient.query('UNLISTEN new_mobile_order').catch(() => { });
            pgClient.query('UNLISTEN mobile_order_updated').catch(() => { });
            pgClient.query('UNLISTEN password_reset_request').catch(() => { });
            pgClient.query('UNLISTEN mobile_user_activity').catch(() => { });
            pgClient.release();
        }
    });
});

// ─── Mobile Ordering Settings (Admin) ───────────────────────────────
router.get('/settings', checkRole(['admin']), async (req: any, res) => {
    try {
        const settings = await getMobileCustomerService().getMobileSettings(req.tenantId);
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/settings', checkRole(['admin']), async (req: any, res) => {
    try {
        const settings = await getMobileCustomerService().updateMobileSettings(req.tenantId, req.body);
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Shop Branding / Slug (Admin) ───────────────────────────────────
// Optional query: ?branchId=... to load branding for a specific branch (slug + branch info).
router.get('/branding', checkRole(['admin']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        const { getShopService } = await import('../../services/shopService.js');
        const branchId = req.query.branchId as string | undefined;

        const tenantRows = await db.query(
            'SELECT slug, company_name FROM tenants WHERE id = $1',
            [req.tenantId]
        );
        if (tenantRows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        const branding = await getShopService().getTenantBranding(req.tenantId);
        let slug = tenantRows[0].slug;
        let branch_name: string | null = null;
        let branch_location: string | null = null;

        if (branchId) {
            const branchRows = await db.query(
                'SELECT slug, name, location FROM shop_branches WHERE id = $1 AND tenant_id = $2',
                [branchId, req.tenantId]
            );
            if (branchRows.length > 0) {
                slug = branchRows[0].slug || slug;
                branch_name = branchRows[0].name;
                branch_location = branchRows[0].location;
            }
        }

        res.json({
            ...branding,
            slug,
            company_name: tenantRows[0].company_name,
            branchId: branchId || null,
            branch_name: branch_name || null,
            branch_location: branch_location || null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/branding', checkRole(['admin']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        const { getShopService } = await import('../../services/shopService.js');
        const branchId = req.body.branchId as string | undefined;

        // 1. Slug: if branchId provided, update branch slug; else update tenant slug (legacy)
        if (req.body.slug !== undefined) {
            if (branchId) {
                await getShopService().updateBranch(req.tenantId, branchId, { slug: req.body.slug });
            } else {
                await getMobileCustomerService().updateTenantBranding(req.tenantId, {
                    slug: req.body.slug
                });
            }
        }

        // 2. Update company_name if provided
        if (req.body.company_name !== undefined) {
            await db.execute(
                'UPDATE tenants SET company_name = $1 WHERE id = $2',
                [req.body.company_name, req.tenantId]
            );
        }

        // 3. Update detailed branding in tenant_branding table
        const brandingData = {
            ...req.body,
            logo_url: req.body.logo_url,
            primary_color: req.body.primary_color || req.body.brand_color
        };

        const updatedBranding = await getShopService().updateTenantBranding(req.tenantId, brandingData);

        await db.execute(
            'UPDATE tenants SET logo_url = $1, brand_color = $2 WHERE id = $3',
            [updatedBranding.logo_url, updatedBranding.primary_color, req.tenantId]
        );

        const outSlug = req.body.slug !== undefined ? req.body.slug : (branchId
            ? (await db.query('SELECT slug FROM shop_branches WHERE id = $1 AND tenant_id = $2', [branchId, req.tenantId]))[0]?.slug
            : (await db.query('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]))[0]?.slug);

        res.json({
            ...updatedBranding,
            slug: outSlug,
            company_name: req.body.company_name,
            branchId: branchId || null,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── QR Code data ───────────────────────────────────────────────────
// Optional query: ?branchId=... to get QR for that branch's slug (for sticker at branch door).
router.get('/qr-code', checkRole(['admin']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        const branchId = req.query.branchId as string | undefined;
        let slug: string;

        if (branchId) {
            const branchRows = await db.query(
                'SELECT slug FROM shop_branches WHERE id = $1 AND tenant_id = $2',
                [branchId, req.tenantId]
            );
            if (branchRows.length === 0) return res.status(404).json({ error: 'Branch not found' });
            slug = branchRows[0].slug;
            if (!slug) {
                return res.status(400).json({ error: 'This branch has no URL slug. Set a slug in App Branding for this branch first.' });
            }
        } else {
            slug = await getMobileCustomerService().getOrCreateSlug(req.tenantId);
        }

        const baseUrl = process.env.MOBILE_APP_URL || 'http://localhost:5175';
        const shopUrl = `${baseUrl}/${slug}`;

        res.json({
            slug,
            url: shopUrl,
            qrData: shopUrl,
            branchId: branchId || null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Online Mobile Users (POS view) ─────────────────────────────────
router.get('/online-users', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        const thresholdMinutes = parseInt(req.query.threshold as string) || 5;

        const users = await db.query(
            `SELECT
                h.customer_id,
                h.last_seen_at,
                h.current_page,
                h.cart_item_count,
                h.cart_total,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.created_at AS registered_at,
                c.last_login_at
             FROM mobile_customer_heartbeats h
             INNER JOIN mobile_customers c ON c.id = h.customer_id AND c.tenant_id = h.tenant_id
             WHERE h.tenant_id = $1
               AND h.last_seen_at > NOW() - INTERVAL '1 minute' * $2
             ORDER BY h.last_seen_at DESC`,
            [req.tenantId, thresholdMinutes]
        );

        const totalRegistered = await db.query(
            'SELECT COUNT(*) AS count FROM mobile_customers WHERE tenant_id = $1',
            [req.tenantId]
        );

        const todayActive = await db.query(
            `SELECT COUNT(*) AS count FROM mobile_customer_heartbeats
             WHERE tenant_id = $1 AND last_seen_at > NOW() - INTERVAL '24 hours'`,
            [req.tenantId]
        );

        const withCarts = users.filter((u: any) => (parseInt(u.cart_item_count) || 0) > 0);

        res.json({
            users,
            stats: {
                online_now: users.length,
                active_today: parseInt(todayActive[0]?.count) || 0,
                total_registered: parseInt(totalRegistered[0]?.count) || 0,
                browsing: users.filter((u: any) => (parseInt(u.cart_item_count) || 0) === 0).length,
                shopping: withCarts.length,
                total_cart_value: withCarts.reduce((s: number, u: any) => s + (parseFloat(u.cart_total) || 0), 0),
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Unsynced orders ────────────────────────────────────────────────
router.get('/unsynced', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const orders = await getMobileOrderService().getUnsyncedOrders(req.tenantId);
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Product mobile visibility (Admin) ──────────────────────────────
router.put('/products/:id/mobile', checkRole(['admin']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        await db.execute(
            `UPDATE shop_products
       SET mobile_visible = COALESCE($1, mobile_visible),
           mobile_price = $2,
           mobile_description = COALESCE($3, mobile_description),
           mobile_sort_order = COALESCE($4, mobile_sort_order),
           updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
            [
                req.body.mobile_visible,
                req.body.mobile_price ?? null,     // Allow explicit null to clear override
                req.body.mobile_description,
                req.body.mobile_sort_order,
                req.params.id,
                req.tenantId,
            ]
        );
        res.json({ success: true, message: 'Product mobile settings updated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Password reset queue (mobile → POS) — before /:id ───────────────
router.get('/password-reset-requests', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const rows = await getCustomerIdentityService().listPendingPasswordResets(req.tenantId);
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/password-reset-requests/:id/complete', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const result = await getCustomerIdentityService().completePasswordResetFromPOS(req.tenantId, req.params.id);
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── Reset mobile customer password (shop support) — before /:id ─────
router.put('/customers/:customerId/reset-password', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) {
            return res.status(400).json({ error: 'newPassword is required' });
        }
        const result = await getMobileCustomerService().resetPasswordByShop(
            req.tenantId,
            req.params.customerId,
            newPassword
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── Mobile Orders List (POS view) ──────────────────────────────────
router.get('/', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
    try {
        const status = req.query.status as string;
        const orders = await getMobileOrderService().getMobileOrdersForPOS(req.tenantId, status);
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Riders overview + manual assignment (POS) — before GET /:id ─────
router.get('/riders-overview', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
    try {
        const data = await getMobileOrderService().getPosRidersOverview(req.tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/:id/assign-rider', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const riderId = req.body?.riderId as string | undefined;
        if (!riderId) return res.status(400).json({ error: 'riderId is required' });
        const result = await getMobileOrderService().assignRiderManually(req.tenantId, req.params.id, riderId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── Collect Payment (Delivered → Paid) ─────────────────────────────
router.put('/:id/collect-payment', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { bankAccountId, paymentType } = req.body;
        if (paymentType === 'khata') {
            const result = await getMobileOrderService().collectPaymentKhata(
                req.tenantId, req.params.id, req.userId
            );
            return res.json(result);
        }
        if (!bankAccountId) return res.status(400).json({ error: 'bankAccountId is required' });

        const result = await getMobileOrderService().collectPayment(
            req.tenantId, req.params.id, bankAccountId, req.userId
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ════════════════════════════════════════════════════════════════════
// /:id wildcard routes — MUST be LAST to avoid shadowing named routes
// ════════════════════════════════════════════════════════════════════

// ─── Order detail ───────────────────────────────────────────────────
router.get('/:id', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
    try {
        const order = await getMobileOrderService().getOrderDetail(req.tenantId, req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Update order status ────────────────────────────────────────────
router.put('/:id/status', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { status, note } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const result = await getMobileOrderService().updateOrderStatus(
            req.tenantId, req.params.id, status,
            req.userId, 'shop_user', note
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── Mark order as synced to POS ────────────────────────────────────
router.put('/:id/synced', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        await getMobileOrderService().markOrderSynced(req.tenantId, req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
