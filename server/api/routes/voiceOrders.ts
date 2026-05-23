import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getDatabaseService } from '../../services/databaseService.js';
import { getVoiceOrderService } from '../../services/voiceOrderService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';
import { mobileAuthMiddleware } from '../../middleware/mobileMiddleware.js';

const ALLOWED_AUDIO = new Set([
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/ogg',
]);

const voiceUploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.resolve(process.cwd(), 'uploads/voice');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `voice-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const voiceUpload = multer({
    storage: voiceUploadStorage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase();
        if (ALLOWED_AUDIO.has(mime) || mime.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported audio format'));
        }
    },
});

export const shopVoiceOrdersRouter = express.Router();
export const mobileVoiceOrdersRouter = express.Router();

console.log('✅ Voice orders routers initialized');

// ─── POS / Shop SSE ─────────────────────────────────────────────────
shopVoiceOrdersRouter.get('/stream', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
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
            await pgClient.query('LISTEN new_voice_order');
            await pgClient.query('LISTEN voice_order_updated');
            pgClient.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    if (payload.tenantId !== tenantId) return;
                    const type = msg.channel === 'new_voice_order' ? 'new_voice_order' : 'voice_order_updated';
                    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
                } catch { /* ignore */ }
            });
        } catch (err) {
            console.error('Voice order SSE error:', err);
        }
    }
    req.on('close', () => {
        clearInterval(heartbeat);
        if (pgClient) {
            pgClient.query('UNLISTEN new_voice_order').catch(() => {});
            pgClient.query('UNLISTEN voice_order_updated').catch(() => {});
            pgClient.release();
        }
    });
});

shopVoiceOrdersRouter.get('/settings', checkRole(['admin']), async (req: any, res) => {
    try {
        const settings = await getVoiceOrderService().getSettings(req.tenantId);
        res.json(settings);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopVoiceOrdersRouter.put('/settings', checkRole(['admin']), async (req: any, res) => {
    try {
        const updated = await getVoiceOrderService().updateSettings(req.tenantId, req.body);
        res.json(updated);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

shopVoiceOrdersRouter.get('/analytics', checkRole(['admin']), async (req: any, res) => {
    try {
        const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 365);
        const data = await getVoiceOrderService().getAnalytics(req.tenantId, days);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopVoiceOrdersRouter.get('/', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const data = await getVoiceOrderService().listOrders(req.tenantId, {
            status: req.query.status as string,
            branchId: req.query.branchId as string,
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
            cursor: req.query.cursor as string,
        });
        res.json(data.items);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopVoiceOrdersRouter.get('/:id', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const order = await getVoiceOrderService().getOrderById(req.tenantId, req.params.id);
        if (!order) return res.status(404).json({ error: 'Not found' });
        res.json(order);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

shopVoiceOrdersRouter.post('/:id/cancel', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
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

shopVoiceOrdersRouter.post('/:id/status', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
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

shopVoiceOrdersRouter.post('/:id/link-invoice', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
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

shopVoiceOrdersRouter.post('/:id/create-invoice', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
    try {
        const { saleId, createMobileOrder, paymentMethod } = req.body;
        if (!saleId) return res.status(400).json({ error: 'saleId required — complete sale in POS first, then link' });
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

// ─── Mobile customer ──────────────────────────────────────────────────
const db = getDatabaseService();

mobileVoiceOrdersRouter.get('/settings', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const enabled = await getVoiceOrderService().isVoiceOrderingEnabled(req.tenantId);
        const settings = await getVoiceOrderService().getSettings(req.tenantId);
        res.json({ enabled, maxRecordingSeconds: settings.max_recording_seconds, maxUploadBytes: settings.max_upload_bytes });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

mobileVoiceOrdersRouter.post('/create', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const order = await getVoiceOrderService().createOrder(req.tenantId, {
            customerId: req.customerId,
            branchId: req.body.branchId,
            notes: req.body.notes,
            deliveryMode: req.body.deliveryMode,
            deliveryAddress: req.body.deliveryAddress,
            deliveryLat: req.body.deliveryLat,
            deliveryLng: req.body.deliveryLng,
            audioDurationSeconds: req.body.audioDurationSeconds,
        });
        res.status(201).json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

mobileVoiceOrdersRouter.post(
    '/:id/upload-audio',
    mobileAuthMiddleware(db),
    (req, res, next) => {
        voiceUpload.single('audio')(req, res, (err: any) => {
            if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
            next();
        });
    },
    async (req: any, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No audio file' });
            const settings = await getVoiceOrderService().getSettings(req.tenantId);
            if (req.file.size > settings.max_upload_bytes) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'File too large' });
            }
            const order = await getVoiceOrderService().getOrderById(req.tenantId, req.params.id, req.customerId);
            if (!order) {
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ error: 'Order not found' });
            }
            const duration = parseFloat(String(req.body.durationSeconds || req.body.audioDuration || '0')) || 0;
            const relativeUrl = `/uploads/voice/${req.file.filename}`;
            const updated = await getVoiceOrderService().attachAudio(
                req.tenantId,
                req.params.id,
                relativeUrl,
                req.file.mimetype,
                duration,
                req.file.path
            );
            res.json(updated);
        } catch (e: any) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(400).json({ error: e.message });
        }
    }
);

mobileVoiceOrdersRouter.get('/', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const data = await getVoiceOrderService().listOrders(req.tenantId, {
            customerId: req.customerId,
            cursor: req.query.cursor as string,
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
        });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

mobileVoiceOrdersRouter.get('/:id', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const order = await getVoiceOrderService().getOrderById(req.tenantId, req.params.id, req.customerId);
        if (!order) return res.status(404).json({ error: 'Not found' });
        res.json(order);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

mobileVoiceOrdersRouter.post('/:id/approve', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const order = await getVoiceOrderService().customerApprove(req.tenantId, req.params.id, req.customerId);
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

mobileVoiceOrdersRouter.post('/:id/status', mobileAuthMiddleware(db), async (req: any, res) => {
    try {
        const { status, note } = req.body;
        if (status !== 'Cancelled') {
            return res.status(403).json({ error: 'Customers can only cancel voice orders' });
        }
        const order = await getVoiceOrderService().updateStatus(
            req.tenantId,
            req.params.id,
            status,
            req.customerId,
            'customer',
            note
        );
        res.json(order);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});
