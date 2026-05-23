import express from 'express';
import * as fs from 'fs';
import multer from 'multer';
import path from 'path';
import { getCustomerFeedbackService } from '../../services/customerFeedbackService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.resolve(process.cwd(), 'uploads/feedback');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'feedback-' + unique + path.extname(file.originalname || '.jpg'));
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Only image uploads are allowed'));
            return;
        }
        cb(null, true);
    },
});

const router = express.Router();
const canView = ['admin', 'accountant', 'pos_cashier'];
const canManage = ['admin', 'pos_cashier'];

router.post('/upload-attachment', checkRole(canManage), upload.single('image'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/feedback/${req.file.filename}` });
});

router.get('/stats', checkRole(canView), async (req: any, res) => {
    try {
        const stats = await getCustomerFeedbackService().getFeedbackStats(req.tenantId);
        res.json(stats);
    } catch (e: any) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.get('/analytics/product-requests', checkRole(canView), async (req: any, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
        const data = await getCustomerFeedbackService().getProductRequestAnalytics(req.tenantId, limit);
        res.json(data);
    } catch (e: any) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.get('/', checkRole(canView), async (req: any, res) => {
    try {
        const result = await getCustomerFeedbackService().listShopFeedback(req.tenantId, {
            type: req.query.type as string,
            status: req.query.status as string,
            priority: req.query.priority as string,
            search: req.query.search as string,
            module: req.query.module as string,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        });
        res.json(result);
    } catch (e: any) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.get('/:id', checkRole(canView), async (req: any, res) => {
    try {
        const item = await getCustomerFeedbackService().getFeedbackById(req.tenantId, req.params.id);
        res.json(item);
    } catch (e: any) {
        res.status(e.statusCode || 404).json({ error: e.message });
    }
});

router.post('/:id/reply', checkRole(canManage), async (req: any, res) => {
    try {
        const { message, isThankYou, status, priority } = req.body || {};
        const item = await getCustomerFeedbackService().replyToFeedback(req.tenantId, req.params.id, {
            authorType: 'staff',
            authorId: req.user?.userId,
            authorName: req.user?.name,
            message,
            isThankYou: !!isThankYou,
            newStatus: status,
            priority,
        });
        res.json(item);
    } catch (e: any) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.patch('/:id', checkRole(canManage), async (req: any, res) => {
    try {
        const { status, priority } = req.body || {};
        const item = await getCustomerFeedbackService().updateFeedbackStatus(req.tenantId, req.params.id, {
            status,
            priority,
        });
        res.json(item);
    } catch (e: any) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

export default router;
