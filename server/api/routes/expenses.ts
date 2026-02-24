import express from 'express';
import { getExpenseService } from '../../services/expenseService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';
import * as fs from 'fs';
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.resolve(process.cwd(), 'uploads/expense');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'expense-' + unique + path.extname(file.originalname || ''));
  },
});
const upload = multer({ storage });

const router = express.Router();

// Roles: admin full, accountant/manager create+view, cashier view only
const canCreate = ['admin', 'accountant'];
const canManage = ['admin', 'accountant'];
const canView = ['admin', 'accountant', 'pos_cashier'];

router.post('/upload-attachment', checkRole(canCreate), upload.single('attachment'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ attachmentUrl: `/uploads/expense/${req.file.filename}` });
});

router.get('/categories', checkRole(canView), async (req: any, res) => {
  try {
    const categories = await getExpenseService().getCategories(req.tenantId);
    res.json(categories);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/categories', checkRole(['admin']), async (req: any, res) => {
  try {
    const category = await getExpenseService().createCategory(req.tenantId, req.body);
    res.status(201).json(category);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/', checkRole(canCreate), async (req: any, res) => {
  try {
    const created = await getExpenseService().createExpense(req.tenantId, {
      ...req.body,
      createdBy: req.user?.userId,
    });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/', checkRole(canView), async (req: any, res) => {
  try {
    const filters: any = {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      categoryId: req.query.categoryId as string,
      vendorId: req.query.vendorId as string,
      paymentMethod: req.query.paymentMethod as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };
    const result = await getExpenseService().listExpenses(req.tenantId, filters);
    res.json(result);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Recurring (must be before /:id)
router.get('/recurring/list', checkRole(canView), async (req: any, res) => {
  try {
    const list = await getExpenseService().listRecurring(req.tenantId);
    res.json(list);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/recurring', checkRole(canCreate), async (req: any, res) => {
  try {
    const created = await getExpenseService().createRecurring(req.tenantId, req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/recurring/process-due', checkRole(canManage), async (req: any, res) => {
  try {
    const upToDate = (req.body.upToDate as string) || new Date().toISOString().slice(0, 10);
    const result = await getExpenseService().processDueRecurring(
      req.tenantId,
      upToDate,
      req.user?.userId
    );
    res.json(result);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Reports (must be before /:id)
router.get('/reports/monthly-summary', checkRole(canView), async (req: any, res) => {
  try {
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const data = await getExpenseService().getMonthlySummary(req.tenantId, year, month);
    res.json(data);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/reports/category-wise', checkRole(canView), async (req: any, res) => {
  try {
    const from = (req.query.fromDate as string) || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10);
    const to = (req.query.toDate as string) || new Date().toISOString().slice(0, 10);
    const data = await getExpenseService().getCategoryWiseReport(req.tenantId, from, to);
    res.json(data);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/reports/expense-vs-revenue', checkRole(canView), async (req: any, res) => {
  try {
    const from = (req.query.fromDate as string) || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10);
    const to = (req.query.toDate as string) || new Date().toISOString().slice(0, 10);
    const data = await getExpenseService().getExpenseVsRevenue(req.tenantId, from, to);
    res.json(data);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/reports/vendor', checkRole(canView), async (req: any, res) => {
  try {
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    const data = await getExpenseService().getVendorExpenseReport(req.tenantId, from, to);
    res.json(data);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/:id', checkRole(canView), async (req: any, res) => {
  try {
    const expense = await getExpenseService().getExpenseById(req.tenantId, req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.delete('/:id', checkRole(canManage), async (req: any, res) => {
  try {
    await getExpenseService().deleteExpense(req.tenantId, req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

export default router;
