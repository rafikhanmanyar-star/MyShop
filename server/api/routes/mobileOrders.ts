import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import { getMobileCustomerService } from '../../services/mobileCustomerService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

console.log('✅ Mobile-orders POS router initialized');

// ════════════════════════════════════════════════════════════════════
// ⚠️ IMPORTANT: All named routes MUST be declared BEFORE the /:id
//    wildcard route, otherwise Express will match "settings" etc as IDs.
// ════════════════════════════════════════════════════════════════════

// ─── SSE: Real-time order stream for POS ─────────────────────────────
router.get('/stream', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    const tenantId = req.tenantId;

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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

            pgClient.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    // Only forward notifications for this tenant
                    if (payload.tenantId === tenantId) {
                        res.write(`data: ${JSON.stringify({ type: 'new_order', ...payload })}\n\n`);
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
router.get('/branding', checkRole(['admin']), async (req: any, res) => {
    try {
        const db = getDatabaseService();
        const rows = await db.query(
            'SELECT slug, logo_url, brand_color, company_name FROM tenants WHERE id = $1',
            [req.tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
        res.json(rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/branding', checkRole(['admin']), async (req: any, res) => {
    try {
        await getMobileCustomerService().updateTenantBranding(req.tenantId, req.body);
        res.json({ success: true, message: 'Branding updated' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── QR Code data ───────────────────────────────────────────────────
// Returns the shop URL to encode in a QR code. The POS client renders
// the actual scannable QR using qrcode.react, and can print it as a
// sticker for customers to scan with their phone camera.
router.get('/qr-code', checkRole(['admin']), async (req: any, res) => {
    try {
        const slug = await getMobileCustomerService().getOrCreateSlug(req.tenantId);
        // In production, set MOBILE_APP_URL to your deployed PWA domain
        // e.g. https://order.myshop.com
        const baseUrl = process.env.MOBILE_APP_URL || 'http://localhost:5175';
        const shopUrl = `${baseUrl}/${slug}`;

        res.json({
            slug,
            url: shopUrl,
            qrData: shopUrl, // The data to encode in the QR code
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
