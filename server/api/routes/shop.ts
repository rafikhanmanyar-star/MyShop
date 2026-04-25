import express from 'express';
import { getShopService } from '../../services/shopService.js';
import { getRiderService } from '../../services/riderService.js';
import { getRiderAuthService } from '../../services/riderAuthService.js';
import { getSalesReturnService } from '../../services/salesReturnService.js';
import { getOfferService } from '../../services/offerService.js';
import { getTenantManagementService } from '../../services/tenantManagementService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';
import * as fs from 'fs';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      console.log('📂 Current working directory:', process.cwd());
      const uploadDir = path.resolve(process.cwd(), 'uploads/product');
      if (!fs.existsSync(uploadDir)) {
        console.log('📂 Creating upload directory:', uploadDir);
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err: any) {
      console.error('❌ Multer destination error:', err);
      cb(err, '');
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

/** Square WebP icons for mobile category rail (POS Inventory → Categories). */
const categoryIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

const router = express.Router();

console.log('✅ Shop router initialized');

router.get('/public-test', (_req, res) => {
  res.json({ message: 'Shop routes are working' });
});

// --- Branches (admin: full; pos_cashier: read-only for shift start location) ---
router.get('/branches', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const branches = await getShopService().getBranches(req.tenantId);
    res.json(branches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/branches', checkRole(['admin']), async (req: any, res) => {
  try {
    const branchId = await getShopService().createBranch(req.tenantId, req.body);
    res.status(201).json({ id: branchId, message: 'Branch registered successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/branches/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getShopService().updateBranch(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Branch updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/branches/:id/delete-status', checkRole(['admin']), async (req: any, res) => {
  try {
    const status = await getShopService().getBranchDeleteStatus(req.tenantId, req.params.id);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/branches/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getShopService().deleteBranch(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Branch deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Delivery riders (Stage 6 rider app): admin manages accounts & passwords ---
router.get('/riders', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const riders = await getRiderService().listByTenant(req.tenantId);
    res.json(riders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/riders', checkRole(['admin']), async (req: any, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone, and password are required' });
    }
    const created = await getRiderAuthService().createRiderWithPassword(req.tenantId, { name, phone, password });
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/riders/:id/password', checkRole(['admin']), async (req: any, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password is required' });
    await getRiderAuthService().setPassword(req.tenantId, req.params.id, password);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/riders/:id/active', checkRole(['admin']), async (req: any, res) => {
  try {
    const isActive = req.body?.is_active;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'is_active (boolean) is required' });
    await getRiderService().setActiveStatus(req.tenantId, req.params.id, isActive);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/riders/:id/activity', checkRole(['admin']), async (req: any, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const rows = await getRiderService().getActivity(req.tenantId, req.params.id, limit);
    res.json(rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Warehouses ---
router.get('/warehouses', async (req: any, res) => {
  try {
    const warehouses = await getShopService().getWarehouses(req.tenantId);
    res.json(warehouses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/warehouses', async (req: any, res) => {
  try {
    const warehouseId = await getShopService().createWarehouse(req.tenantId, req.body);
    res.status(201).json({ id: warehouseId, message: 'Warehouse created successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Terminals ---
router.get('/terminals', async (req: any, res) => {
  try {
    const terminals = await getShopService().getTerminals(req.tenantId);
    res.json(terminals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/terminals', async (req: any, res) => {
  try {
    const terminalId = await getShopService().createTerminal(req.tenantId, req.body);
    res.status(201).json({ id: terminalId, message: 'Terminal registered successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/terminals/:id', async (req: any, res) => {
  try {
    await getShopService().updateTerminal(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Terminal updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/terminals/:id', async (req: any, res) => {
  try {
    await getShopService().deleteTerminal(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Terminal removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Categories ---
router.get('/categories', async (req: any, res) => {
  try {
    const categories = await getShopService().getShopCategories(req.tenantId);
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/categories', async (req: any, res) => {
  try {
    const id = await getShopService().createShopCategory(req.tenantId, req.body);
    res.status(201).json({ id, message: 'Category created' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/categories/:id', async (req: any, res) => {
  try {
    await getShopService().updateShopCategory(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Category updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/categories/:id', async (req: any, res) => {
  try {
    await getShopService().deleteShopCategory(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Products ---
router.get('/products', async (req: any, res) => {
  try {
    console.log('--- GET /api/shop/products ---');
    console.log('Headers:', {
      authorization: req.headers.authorization ? 'Bearer ***' : 'none',
      tenantId: req.headers.tenantid || req.headers.tenant_id,
      orgId: req.headers.orgid || req.headers.org_id
    });
    console.log('Params:', req.params);
    console.log('Query:', req.query);
    console.log('Decoded Request User/Tenant:', {
      tenantId: req.tenantId,
      userId: req.userId,
      role: req.userRole
    });

    if (!req.tenantId) {
      console.warn('❌ Missing tenantId for products request');
      return res.status(400).json({ success: false, message: 'Missing tenantId', code: 'MISSING_TENANT' });
    }

    // Determine tenant fallback (using tenantId instead of organization_id)
    const tenantId = req.tenantId;

    console.log(`Executing getProducts for tenantId = ${tenantId}`);

    // Attempt DB fetch
    const products = await getShopService().getProducts(tenantId);

    if (!products) {
      console.warn('⚠️ No records returned, defaulting to empty array');
      return res.json([]);
    }

    console.log(`✅ Loaded ${products.length} products successfully.`);
    res.json(products);
  } catch (error: any) {
    console.error('❌ Error fetching products:', error);
    try {
      fs.appendFileSync('f:/AntiGravity projects/MyShop/server/server_errors.log', '\\nERROR:\\n' + error.stack + '\\n');
    } catch (e) { }

    // Return structured error as per prompt instruction
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      code: 'PRODUCT_FETCH_FAILED'
    });
  }
});

router.get('/popular-products', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const products = await getShopService().getPopularProducts(req.tenantId, limit);
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/products/:id', async (req: any, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ success: false, message: 'Missing tenantId', code: 'MISSING_TENANT' });
    }
    const row = await getShopService().getProductById(req.tenantId, req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'OK', data: row });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to load product' });
  }
});

router.post('/products', async (req: any, res) => {
  try {
    const data = await getShopService().createProduct(req.tenantId, {
      ...req.body,
      created_by: req.userId,
    });
    res.status(201).json({ success: true, message: 'Product saved successfully', data });
  } catch (error: any) {
    const msg = error.message || 'Failed to create product';
    const status = /required|already exists/i.test(msg) ? 400 : 500;
    res.status(status).json({ success: false, message: msg });
  }
});

router.put('/products/:id', async (req: any, res) => {
  try {
    const data = await getShopService().updateProduct(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Product updated successfully', data });
  } catch (error: any) {
    const msg = error.message || 'Failed to update product';
    const status = /not found|already exists|no matching row/i.test(msg) ? 400 : 500;
    res.status(status).json({ success: false, message: msg });
  }
});

router.get('/products/:id/delete-status', async (req: any, res) => {
  try {
    const status = await getShopService().getProductDeleteStatus(req.tenantId, req.params.id);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/products/:id', async (req: any, res) => {
  try {
    await getShopService().deleteProduct(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/upload-image', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({ error: `Multer upload error: ${err.message}` });
    } else if (err) {
      console.error('❌ Unknown upload error:', err);
      return res.status(500).json({ error: `Upload error: ${err.message}` });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const imageUrl = `/uploads/product/${req.file.filename}`;
      console.log('✅ Image uploaded successfully:', imageUrl);
      res.json({ imageUrl });
    } catch (error: any) {
      console.error('❌ Post-upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

router.post('/upload-category-icon', (req, res, next) => {
  categoryIconUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(500).json({ error: err.message || 'Upload failed' });
    }
    try {
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: 'No image uploaded (use JPEG, PNG, WebP, or GIF).' });
      }
      const uploadDir = path.resolve(process.cwd(), 'uploads/category');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `cat-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const outPath = path.join(uploadDir, filename);
      await sharp(file.buffer)
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'centre' })
        .webp({ quality: 86 })
        .toFile(outPath);
      const imageUrl = `/uploads/category/${filename}`;
      res.json({ imageUrl });
    } catch (error: any) {
      console.error('Category icon processing error:', error);
      res.status(500).json({ error: error.message || 'Could not process image' });
    }
  });
});

router.get('/debug-uploads', (req: any, res) => {
  try {
    const uploadDir = path.resolve(process.cwd(), 'uploads/product');
    const exists = fs.existsSync(uploadDir);
    if (!exists) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Test write
    const testFile = path.join(uploadDir, 'test-write.txt');
    fs.writeFileSync(testFile, 'Test write at ' + new Date().toISOString());

    const files = fs.readdirSync(uploadDir);
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const allFolders = fs.existsSync(uploadsRoot) ? fs.readdirSync(uploadsRoot) : [];

    res.json({
      cwd: process.cwd(),
      uploadDir,
      exists,
      allFoldersInUploads: allFolders,
      filesInProductFolder: files,
      testFileCreated: fs.existsSync(testFile),
      tenantId: req.tenantId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Inventory ---
router.get('/inventory', async (req: any, res) => {
  try {
    const t0 = Date.now();
    const inventory = await getShopService().getInventory(req.tenantId);
    res.setHeader('X-Response-Time-Ms', String(Date.now() - t0));
    res.json(inventory);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Paginated SKU + stock summary (optimized for large catalogs). */
router.get('/inventory/skus', async (req: any, res) => {
  try {
    const t0 = Date.now();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const stockFilter = typeof req.query.stockFilter === 'string' ? req.query.stockFilter : 'all';
    const result = await getShopService().listInventorySkus(req.tenantId, {
      page,
      limit,
      search,
      stockFilter,
    });
    res.setHeader('X-Response-Time-Ms', String(Date.now() - t0));
    res.json({ ...result, routeMs: Date.now() - t0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/inventory/adjust', async (req: any, res) => {
  try {
    const data = { ...req.body, userId: req.user?.userId || 'system' };
    const result = await getShopService().adjustInventory(req.tenantId, data);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/inventory/movements', async (req: any, res) => {
  try {
    const productId = req.query.productId as string;
    const maxRows = Math.min(10000, Math.max(1, parseInt(String(req.query.limit || '5000'), 10) || 5000));
    const movements = await getShopService().getInventoryMovements(req.tenantId, productId, maxRows);
    res.json(movements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/inventory/expiry-summary', async (req: any, res) => {
  try {
    const summary = await getShopService().getInventoryExpirySummary(req.tenantId);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/inventory/batches/:batchId/expiry', async (req: any, res) => {
  try {
    const expiryDate = req.body?.expiryDate;
    const row = await getShopService().updateInventoryBatchExpiry(
      req.tenantId,
      req.params.batchId,
      expiryDate
    );
    res.json(row);
  } catch (error: any) {
    const msg = error?.message || 'Failed to update batch expiry';
    const status = msg === 'Batch not found' ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

// --- Sales (Admin/Cashier) ---
router.get('/sales', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const raw = req.query?.days;
    const days = raw != null && raw !== '' ? parseInt(String(raw), 10) : null;
    const sales = await getShopService().getSales(req.tenantId, {
      days: days != null && Number.isFinite(days) && days > 0 ? days : null,
    });
    res.json(sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sales', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const body = { ...req.body, userId: req.userId ?? req.body?.userId };
    const pm = (body.paymentMethod || '').toLowerCase();
    if (pm.includes('khata') && !body.customerId) {
      return res.status(400).json({ error: 'Customer is required when payment method is Khata / Credit' });
    }
    const result = await getShopService().createSale(req.tenantId, body);
    if (req.timedout) return;
    const saleId = typeof result === 'object' && result?.id != null ? result.id : result;
    const barcode_value = typeof result === 'object' && result?.barcode_value != null ? result.barcode_value : undefined;
    res.status(201).json({ id: saleId, barcode_value, message: 'Sale completed successfully' });
  } catch (error: any) {
    if (req.timedout) return;
    const message = (error && typeof error === 'object' && 'message' in error)
      ? error.message
      : String(error ?? 'Internal server error');
    const safeMessage = message || 'Internal server error';
    console.error('POST /shop/sales failed:', safeMessage, error);
    res.status(500).json({ error: safeMessage });
  }
});

// Sales returns — nested under /sales/returns (primary; avoids hyphen/proxy quirks). Legacy /sales-returns aliases below.
router.get('/sales/returns', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const rows = await getSalesReturnService().listReturns(req.tenantId);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales/returns/:id', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const row = await getSalesReturnService().getReturnById(req.tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Return not found' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sales/returns', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const body = { ...req.body, userId: req.userId ?? req.body?.userId };
    const result = await getSalesReturnService().createReturn(req.tenantId, body);
    res.status(201).json(result);
  } catch (error: any) {
    const status = /not found|void|already|exceeds|required|Invalid/i.test(String(error.message)) ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to create return' });
  }
});

router.get('/sales-returns', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const rows = await getSalesReturnService().listReturns(req.tenantId);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales-returns/:id', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const row = await getSalesReturnService().getReturnById(req.tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Return not found' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sales-returns', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const body = { ...req.body, userId: req.userId ?? req.body?.userId };
    const result = await getSalesReturnService().createReturn(req.tenantId, body);
    res.status(201).json(result);
  } catch (error: any) {
    const status = /not found|void|already|exceeds|required|Invalid/i.test(String(error.message)) ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to create return' });
  }
});

// --- Loyalty ---
router.get('/loyalty/members', async (req: any, res) => {
  try {
    const members = await getShopService().getLoyaltyMembers(req.tenantId);
    res.json(members);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/loyalty/members', async (req: any, res) => {
  try {
    const memberId = await getShopService().createLoyaltyMember(req.tenantId, req.body);
    res.status(201).json({ id: memberId, message: 'Member enrolled successfully' });
  } catch (error: any) {
    const msg = String(error?.message || '');
    const status =
      /Invalid phone|already exists|Phone number is required/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg || 'Failed to enroll member' });
  }
});

router.put('/loyalty/members/:id', async (req: any, res) => {
  try {
    await getShopService().updateLoyaltyMember(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Member updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/loyalty/members/:id', async (req: any, res) => {
  try {
    await getShopService().deleteLoyaltyMember(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Policies ---
router.get('/policies', async (req: any, res) => {
  try {
    const policies = await getShopService().getPolicies(req.tenantId);
    res.json(policies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/policies', async (req: any, res) => {
  try {
    const policies = await getShopService().updatePolicies(req.tenantId, req.body);
    res.json(policies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Bank Accounts (Admin/Accountant: full; pos_cashier: read-only for POS & Collect Payment) ---
router.get('/bank-accounts', checkRole(['admin', 'accountant', 'pos_cashier']), async (req: any, res) => {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const list = await getShopService().getBankAccounts(req.tenantId, activeOnly);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bank-accounts', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const id = await getShopService().createBankAccount(req.tenantId, req.body);
    res.status(201).json({ id, message: 'Bank account created' });
  } catch (error: any) {
    const status = error.statusCode === 409 ? 409 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.put('/bank-accounts/:id', async (req: any, res) => {
  try {
    await getShopService().updateBankAccount(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Bank account updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bank-accounts/:id', async (req: any, res) => {
  try {
    await getShopService().deleteBankAccount(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Bank account deactivated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Vendors (for Procurement) ---
router.get('/vendors', async (req: any, res) => {
  try {
    const list = await getShopService().getVendors(req.tenantId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vendors', async (req: any, res) => {
  try {
    const vendor = await getShopService().createVendor(req.tenantId, req.body);
    res.status(201).json(vendor);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/vendors/:id', async (req: any, res) => {
  try {
    await getShopService().updateVendor(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Vendor updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/vendors/:id', async (req: any, res) => {
  try {
    await getShopService().deleteVendor(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Vendor deactivated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Users (Admin Only) ---
router.get('/users', checkRole(['admin']), async (req: any, res) => {
  try {
    const list = await getShopService().getUsers(req.tenantId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users', checkRole(['admin']), async (req: any, res) => {
  try {
    const userId = await getShopService().createUser(req.tenantId, req.body);
    res.status(201).json({ id: userId, message: 'User created' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getShopService().updateUser(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'User updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getShopService().deleteUser(req.tenantId, req.params.id);
    res.json({ success: true, message: 'User deactivated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Current organization (tenant row); admin can view/edit own tenant ---
router.get('/tenant', checkRole(['admin']), async (req: any, res) => {
  try {
    const row = await getTenantManagementService().getTenantById(req.tenantId);
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/tenant', checkRole(['admin']), async (req: any, res) => {
  try {
    const row = await getTenantManagementService().updateTenant(req.tenantId, req.body || {});
    res.json(row);
  } catch (error: any) {
    const msg = error.message || 'Update failed';
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    if (msg.includes('already uses')) return res.status(409).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

// --- Branding ---
router.get('/branding', async (req: any, res) => {
  try {
    const branding = await getShopService().getTenantBranding(req.tenantId);
    res.json(branding);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/branding', async (req: any, res) => {
  try {
    const branding = await getShopService().updateTenantBranding(req.tenantId, req.body);
    res.json(branding);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- POS Settings ---
router.get('/pos-settings', async (req: any, res) => {
  try {
    const settings = await getShopService().getPosSettings(req.tenantId);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pos-settings', async (req: any, res) => {
  try {
    const settings = await getShopService().updatePosSettings(req.tenantId, req.body);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// --- Receipt Settings (pos_receipt_settings) ---
router.get('/receipt-settings', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const settings = await getShopService().getReceiptSettings(req.tenantId);
    let mobile_order_url: string | null = null;
    const rider_app_url = (process.env.RIDER_APP_URL || 'http://localhost:5180').replace(/\/$/, '');
    try {
      const { getMobileCustomerService } = await import('../../services/mobileCustomerService.js');
      const slug = await getMobileCustomerService().getOrCreateSlug(req.tenantId);
      const baseUrl = process.env.MOBILE_APP_URL || 'http://localhost:5175';
      mobile_order_url = `${baseUrl}/${slug}`;
    } catch (_) {
      // Mobile ordering not set up or slug error
    }
    res.json({ ...settings, mobile_order_url, rider_app_url });
  } catch (error: any) {
    res.status(500).json({ error: error.message, message: error.message });
  }
});

router.post('/receipt-settings', checkRole(['admin']), async (req: any, res) => {
  try {
    const settings = await getShopService().updateReceiptSettings(req.tenantId, req.body);
    let mobile_order_url: string | null = null;
    const rider_app_url = (process.env.RIDER_APP_URL || 'http://localhost:5180').replace(/\/$/, '');
    try {
      const { getMobileCustomerService } = await import('../../services/mobileCustomerService.js');
      const slug = await getMobileCustomerService().getOrCreateSlug(req.tenantId);
      const baseUrl = process.env.MOBILE_APP_URL || 'http://localhost:5175';
      mobile_order_url = `${baseUrl}/${slug}`;
    } catch (_) {}
    res.json({ ...settings, mobile_order_url, rider_app_url });
  } catch (error: any) {
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// --- Sale reprint (increment reprint_count) ---
router.post('/sales/:id/reprint', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const sale = await getShopService().incrementReprintCount(req.tenantId, req.params.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(sale);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Sale by invoice number (for barcode SALE|tenant|invoice lookup) ---
router.get('/sales/by-invoice/:saleNumber', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const sale = await getShopService().getSaleByInvoiceNumber(req.tenantId, req.params.saleNumber);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(sale);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales/return-eligibility/:saleId', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const data = await getSalesReturnService().getReturnEligibility(req.tenantId, req.params.saleId);
    if (!data) return res.status(404).json({ error: 'Sale not found' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Mobile order number (same as shown in the app / POS) — for sales returns on completed mobile orders. */
router.get(
  '/sales/mobile-return-eligibility/:orderNumber',
  checkRole(['admin', 'pos_cashier', 'accountant']),
  async (req: any, res) => {
    try {
      const data = await getSalesReturnService().getMobileOrderReturnEligibilityByOrderNumber(
        req.tenantId,
        req.params.orderNumber
      );
      if (!data) return res.status(404).json({ error: 'Mobile order not found' });
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// --- Settings edit lock (multi-user: one editor at a time for Settings module) ---
router.get('/settings/edit-lock', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const status = await getShopService().getSettingsEditLock(req.tenantId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/settings/edit-lock', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const action = req.body?.action as string | undefined;
    const userId = req.userId;
    const userName = (req.body?.userName as string | undefined)?.trim() || req.user?.username || null;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user context' });
    }
    if (action === 'acquire') {
      const result = await getShopService().acquireSettingsEditLock(req.tenantId, userId, userName);
      if (!result.acquired) {
        return res.status(409).json({
          error: 'Settings are being edited by another user',
          message: `${result.lockedBy.userName || 'Another user'} is currently editing Settings. Please wait until they finish.`,
          lockedBy: result.lockedBy,
        });
      }
      return res.json({ acquired: true, expiresAt: result.expiresAt });
    }
    if (action === 'heartbeat') {
      const result = await getShopService().heartbeatSettingsEditLock(req.tenantId, userId);
      if (!result.ok) {
        return res.status(409).json({
          error: 'Settings edit lock lost',
          message: 'Your edit session expired or another user is editing Settings. Please refresh the page.',
        });
      }
      return res.json({ ok: true, expiresAt: result.expiresAt });
    }
    if (action === 'release') {
      await getShopService().releaseSettingsEditLock(req.tenantId, userId);
      return res.json({ released: true });
    }
    return res.status(400).json({ error: 'Invalid action. Use acquire, heartbeat, or release.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Offers (promotions for mobile) ---
router.get('/offers', checkRole(['admin']), async (req: any, res) => {
  try {
    const offers = await getOfferService().listOffers(req.tenantId);
    res.json(offers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/offers', checkRole(['admin']), async (req: any, res) => {
  try {
    const id = await getOfferService().createOffer(req.tenantId, req.body);
    res.status(201).json({ id, message: 'Offer created' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/offers/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    const offer = await getOfferService().getOfferById(req.tenantId, req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json(offer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/offers/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getOfferService().updateOffer(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Offer updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/offers/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getOfferService().softDeleteOffer(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Offer deactivated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Realtime (SSE): same pg_notify channel as accounting daily stream — for POS/cashier refresh on returns, etc.
router.get('/realtime/stream', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
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
  const { getDatabaseService } = await import('../../services/databaseService.js');
  const db = getDatabaseService();
  const pool = db.getPool();
  let pgClient: any = null;
  if (pool) {
    try {
      pgClient = await pool.connect();
      await pgClient.query('LISTEN daily_report_updated');
      pgClient.on('notification', (msg: any) => {
        try {
          const payload = JSON.parse(msg.payload);
          if (payload.tenantId === tenantId) {
            res.write(`data: ${JSON.stringify({ type: payload.type || 'daily_report_updated', ...payload })}\n\n`);
          }
        } catch (err) {
          console.error('SSE shop realtime parse error:', err);
        }
      });
    } catch (err) {
      console.error('SSE shop realtime LISTEN error:', err);
    }
  }
  req.on('close', () => {
    clearInterval(heartbeat);
    if (pgClient) {
      pgClient.query('UNLISTEN daily_report_updated').catch(() => {});
      pgClient.release();
    }
  });
});

export default router;
