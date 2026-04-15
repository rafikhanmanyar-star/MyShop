import express from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { riderAuthMiddleware } from '../../middleware/riderMiddleware.js';
import { getRiderAuthService } from '../../services/riderAuthService.js';
import { getRiderDeliveryService } from '../../services/riderDeliveryService.js';

const router = express.Router();
const db = getDatabaseService();

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
        const orders = await getRiderDeliveryService().listForRider(req.tenantId, req.riderId);
        res.json({ orders });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
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

router.post('/orders/:orderId/delivered', riderAuthMiddleware(db), async (req: any, res) => {
    try {
        const out = await getRiderDeliveryService().markDelivered(req.tenantId, req.riderId, req.params.orderId);
        res.json(out);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
