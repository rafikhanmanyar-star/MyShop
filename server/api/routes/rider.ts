import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { riderAuthMiddleware } from '../../middleware/riderMiddleware.js';
import { getRiderAuthService } from '../../services/riderAuthService.js';
import { getRiderDeliveryService } from '../../services/riderDeliveryService.js';
import { getRiderService } from '../../services/riderService.js';

const router = express.Router();
const db = getDatabaseService();

router.get('/me', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const row = await getRiderService().getById(req.tenantId, req.riderId);
        if (!row) return res.status(404).json({ error: 'Rider not found' });
        res.json({
            id: row.id,
            name: row.name,
            phone_number: row.phone_number,
            status: row.status,
            current_latitude:
                row.current_latitude != null ? parseFloat(String(row.current_latitude)) : null,
            current_longitude:
                row.current_longitude != null ? parseFloat(String(row.current_longitude)) : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/location', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const { latitude, longitude } = req.body;
        const lat = typeof latitude === 'string' ? parseFloat(latitude) : Number(latitude);
        const lng = typeof longitude === 'string' ? parseFloat(longitude) : Number(longitude);
        await getRiderService().updateLocation(req.tenantId, req.riderId, lat, lng);
        res.json({ ok: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/status', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const { status } = req.body;
        if (status !== 'AVAILABLE' && status !== 'OFFLINE') {
            return res.status(400).json({ error: 'status must be AVAILABLE or OFFLINE' });
        }
        await getRiderService().setAvailabilityStatus(req.tenantId, req.riderId, status);
        res.json({ ok: true });
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
        const result = await getRiderAuthService().login(shopSlug, phone, password);
        res.json(result);
    } catch (error: any) {
        res.status(401).json({ error: error.message || 'Login failed' });
    }
});

router.get('/orders', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const q = req.query as Record<string, string | undefined>;
        const bucketRaw = q.bucket;
        const bucket =
            bucketRaw === 'assigned' || bucketRaw === 'active' || bucketRaw === 'completed'
                ? bucketRaw
                : undefined;
        const limit = q.limit ? parseInt(String(q.limit), 10) : undefined;
        const offset = q.offset ? parseInt(String(q.offset), 10) : undefined;
        const out = await getRiderDeliveryService().listForRider(req.tenantId, req.riderId, {
            bucket,
            limit: Number.isFinite(limit) ? limit : undefined,
            offset: Number.isFinite(offset) ? offset : undefined,
        });
        res.json(out);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/** Stage 11: SSE — refresh when assigned orders / delivery rows change (same PG channel as customer Stage 10). */
router.get('/stream', riderAuthMiddleware(db), async (req: any, res) => {
    const tenantId = req.tenantId;
    const riderId = req.riderId;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', riderId })}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    const pool = db.getPool();
    let pgClient: any = null;

    const forwardIfRelevant = (payload: Record<string, unknown>) => {
        if (payload.riderId === riderId) {
            res.write(`data: ${JSON.stringify({ type: 'order_updated', ...payload })}\n\n`);
            return;
        }
        if (payload.riderId != null) return;

        void (async () => {
            try {
                const rows = await db.query(
                    `SELECT 1 FROM delivery_orders WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3 LIMIT 1`,
                    [tenantId, riderId, payload.orderId]
                );
                if (rows.length > 0) {
                    res.write(`data: ${JSON.stringify({ type: 'order_updated', ...payload })}\n\n`);
                }
            } catch {
                /* ignore */
            }
        })();
    };

    if (pool) {
        try {
            pgClient = await pool.connect();
            await pgClient.query('LISTEN mobile_order_updated');
            pgClient.on('notification', (msg: any) => {
                if (msg.channel !== 'mobile_order_updated') return;
                try {
                    const payload = JSON.parse(msg.payload);
                    if (payload.tenantId !== tenantId) return;
                    forwardIfRelevant(payload);
                } catch (e) {
                    console.error('[rider SSE] notification parse error:', e);
                }
            });
        } catch (err) {
            console.error('[rider SSE] LISTEN error:', err);
        }
    }

    req.on('close', () => {
        clearInterval(heartbeat);
        if (pgClient) {
            pgClient.query('UNLISTEN mobile_order_updated').catch(() => {});
            pgClient.release();
        }
    });
});

router.get('/orders/:orderId', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const detail = await getRiderDeliveryService().getDetailForRider(
            req.tenantId,
            req.riderId,
            req.params.orderId
        );
        if (!detail) return res.status(404).json({ error: 'Order not found' });
        res.json(detail);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/orders/:orderId/accept', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().accept(req.tenantId, req.riderId, req.params.orderId);
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/orders/:orderId/picked', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().markPicked(req.tenantId, req.riderId, req.params.orderId);
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/orders/:orderId/on-the-way', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().markOnTheWay(req.tenantId, req.riderId, req.params.orderId);
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/orders/:orderId/reject', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().rejectAssignment(
            req.tenantId,
            req.riderId,
            req.params.orderId
        );
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/orders/:orderId/delivered', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().markDelivered(req.tenantId, req.riderId, req.params.orderId);
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
