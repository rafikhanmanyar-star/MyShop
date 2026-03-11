import express from 'express';
import { getShopService } from '../../services/shopService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';
import * as fs from 'fs';
import multer from 'multer';
import path from 'path';

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

router.post('/products', async (req: any, res) => {
  try {
    const productId = await getShopService().createProduct(req.tenantId, req.body);
    res.status(201).json({ id: productId, message: 'Product created successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/products/:id', async (req: any, res) => {
  try {
    await getShopService().updateProduct(req.tenantId, req.params.id, req.body);
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    const inventory = await getShopService().getInventory(req.tenantId);
    res.json(inventory);
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
    const movements = await getShopService().getInventoryMovements(req.tenantId, productId);
    res.json(movements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Sales (Admin/Cashier) ---
router.get('/sales', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const sales = await getShopService().getSales(req.tenantId);
    res.json(sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sales', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const body = { ...req.body, userId: req.userId ?? req.body?.userId };
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
    res.status(500).json({ error: error.message });
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
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message, message: error.message });
  }
});

router.post('/receipt-settings', checkRole(['admin']), async (req: any, res) => {
  try {
    const settings = await getShopService().updateReceiptSettings(req.tenantId, req.body);
    res.json(settings);
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

export default router;
