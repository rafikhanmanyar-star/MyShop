import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { getOrderCenterService } from '../../services/orderCenterService.js';
import { getMobileOrderService } from '../../services/mobileOrderService.js';
import { getVoiceOrderService } from '../../services/voiceOrderService.js';
import { getDeliveryChatService } from '../../services/deliveryChatService.js';
import { getRiderService } from '../../services/riderService.js';
import { getRiderAnalyticsService } from '../../services/riderAnalyticsService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';
import type { OrderCenterKind, OrderCenterQueueFilter } from '../../services/orderCenterService.js';

export const shopOrderCenterRouter = express.Router();

console.log('✅ Order Center router initialized');

const QUEUE_FILTERS = new Set([
    'all', 'new', 'voice_pending', 'preparing', 'ready', 'delivered', 'cancelled', 'unpaid',
]);

shopOrderCenterRouter.get('/stream', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    const tenantId = req.tenantId;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', tenantId })}\n\n`);
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    const db = getDatabaseService();
    const pool = db.getPool();
    let pgClient: any = null;
    if (pool) {
        try {
            pgClient = await pool.connect();
            const channels = [
                'new_mobile_order',
                'mobile_order_updated',
                'new_voice_order',
                'voice_order_updated',
                'order_center_updated',
            ];
            for (const ch of channels) await pgClient.query(`LISTEN ${ch}`);
            pgClient.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    if (payload.tenantId !== tenantId) return;
                    let type = 'order_center_updated';
                    if (msg.channel === 'new_mobile_order') type = 'new_order';
                    else if (msg.channel === 'new_voice_order') type = 'new_voice_order';
                    else if (msg.channel === 'mobile_order_updated') type = 'order_updated';
                    else if (msg.channel === 'voice_order_updated') type = 'voice_order_updated';
                    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
                } catch { /* ignore */ }
            });
        } catch (err) {
            console.error('Order Center SSE error:', err);
        }
    }
    req.on('close', () => {
        clearInterval(heartbeat);
        if (pgClient) pgClient.release();
    });
});

shopOrderCenterRouter.get('/queue', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const filter = String(req.query.filter || 'all') as OrderCenterQueueFilter;
        if (!QUEUE_FILTERS.has(filter)) {
            return res.status(400).json({ error: 'Invalid filter' });
        }
        const data = await getOrderCenterService().listQueue(req.tenantId, {
            filter,
            search: req.query.search as string,
            deliveryType: req.query.deliveryType as string,
            riderId: req.query.riderId as string,
            includeCancelled: filter === 'cancelled' || req.query.includeCancelled === 'true',
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
        });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopOrderCenterRouter.get('/customers/:customerId/history', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const history = await getOrderCenterService().getCustomerHistory(
            req.tenantId,
            req.params.customerId,
            req.query.limit ? parseInt(String(req.query.limit), 10) : 10
        );
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopOrderCenterRouter.put('/cart/:id/status', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { status, note } = req.body;
        await getMobileOrderService().updateOrderStatus(
            req.tenantId,
            req.params.id,
            status,
            req.userId || 'shop_user',
            'shop_user',
            note
        );
        const order = await getMobileOrderService().getOrderDetail(req.tenantId, req.params.id);
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.put('/cart/:id/collect-payment', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { bankAccountId, paymentType } = req.body;
        if (paymentType === 'khata') {
            const result = await getMobileOrderService().collectPaymentKhata(
                req.tenantId,
                req.params.id,
                req.userId || 'shop_user'
            );
            return res.json(result);
        }
        if (!bankAccountId) return res.status(400).json({ error: 'bankAccountId is required' });
        const result = await getMobileOrderService().collectPayment(
            req.tenantId,
            req.params.id,
            bankAccountId,
            req.userId || 'shop_user'
        );
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.post('/cart/:id/assign-rider', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { riderId } = req.body;
        const result = await getMobileOrderService().assignRiderManually(req.tenantId, req.params.id, riderId);
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.post('/voice/:id/status', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { status, note } = req.body;
        const order = await getVoiceOrderService().updateStatus(
            req.tenantId,
            req.params.id,
            status,
            req.userId || 'shop_user',
            'shop_user',
            note
        );
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.post('/voice/:id/cancel', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { reason, note, notifyCustomer } = req.body;
        if (!reason) return res.status(400).json({ error: 'reason required' });
        const order = await getVoiceOrderService().cancelVoiceOrder(req.tenantId, req.params.id, {
            reason,
            note,
            notifyCustomer: !!notifyCustomer,
            changedBy: req.userId || 'shop_user',
            changedByType: 'shop_user',
        });
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.post('/voice/:id/link-invoice', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { saleId, createMobileOrder, paymentMethod } = req.body;
        if (!saleId) return res.status(400).json({ error: 'saleId required' });
        const order = await getVoiceOrderService().linkInvoice(
            req.tenantId,
            req.params.id,
            saleId,
            req.userId || 'shop_user',
            { createMobileOrder, paymentMethod }
        );
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.get('/riders/live-locations', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const riders = await getRiderService().listLiveLocations(req.tenantId);
        res.json({ riders });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopOrderCenterRouter.get('/riders/analytics', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const days = req.query.days ? parseInt(String(req.query.days), 10) : 7;
        const out = await getRiderAnalyticsService().getFleetAnalytics(req.tenantId, days);
        res.json(out);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopOrderCenterRouter.get('/cart/:id/chat', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const messages = await getDeliveryChatService().listMessages(req.tenantId, req.params.id, 100);
        res.json({ messages });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.post('/cart/:id/chat', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { body } = req.body;
        const msg = await getDeliveryChatService().sendMessage(
            req.tenantId,
            req.params.id,
            'shop',
            req.userId || 'shop_user',
            body
        );
        res.json(msg);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopOrderCenterRouter.get('/:kind/:id', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const kind = req.params.kind as OrderCenterKind;
        if (kind !== 'cart' && kind !== 'voice') return res.status(400).json({ error: 'Invalid kind' });
        const detail = await getOrderCenterService().getDetail(req.tenantId, kind, req.params.id);
        if (!detail) return res.status(404).json({ error: 'Not found' });
        res.json(detail);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
