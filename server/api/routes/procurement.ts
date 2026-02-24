import express from 'express';
import { getProcurementService } from '../../services/procurementService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/purchase-bills', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const supplierId = req.query.supplierId as string | undefined;
    const list = await getProcurementService().getPurchaseBills(req.tenantId, supplierId);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/purchase-bills/:id', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const bill = await getProcurementService().getPurchaseBillById(req.tenantId, req.params.id);
    if (!bill) return res.status(404).json({ error: 'Purchase bill not found' });
    res.json(bill);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/purchase-bills', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const id = await getProcurementService().createPurchaseBill(req.tenantId, req.body);
    res.status(201).json({ id, message: 'Purchase bill created' });
  } catch (e: any) {
    res.status(e.statusCode === 409 ? 409 : 500).json({ error: e.message });
  }
});

router.get('/supplier-payments', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const supplierId = req.query.supplierId as string | undefined;
    const list = await getProcurementService().getSupplierPayments(req.tenantId, supplierId);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/supplier-payments', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const id = await getProcurementService().recordSupplierPayment(req.tenantId, req.body);
    res.status(201).json({ id, message: 'Supplier payment recorded' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/supplier-ledger', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const supplierId = req.query.supplierId as string | undefined;
    const data = await getProcurementService().getSupplierLedger(req.tenantId, supplierId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bills-with-balance/:supplierId', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const list = await getProcurementService().getBillsWithBalance(req.tenantId, req.params.supplierId);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reports/ap-aging', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const data = await getProcurementService().getAPAgingReport(req.tenantId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reports/inventory-valuation', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const data = await getProcurementService().getInventoryValuationReport(req.tenantId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
