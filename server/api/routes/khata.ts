import express from 'express';
import { checkRole } from '../../middleware/roleMiddleware.js';
import { getKhataService } from '../../services/khataService.js';

const router = express.Router();

router.get('/ledger', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const customerId = req.query.customerId as string | undefined;
    const entries = await getKhataService().getLedger(req.tenantId, customerId);
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/balance/:customerId', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const balance = await getKhataService().getBalance(req.tenantId, req.params.customerId);
    res.json({ balance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const summary = await getKhataService().getSummaryByCustomer(req.tenantId);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/customer/:customerId/summary', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const data = await getKhataService().getCustomerSummary(req.tenantId, req.params.customerId);
    res.json(data ?? { totalDebit: 0, totalCredit: 0, balance: 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/receive-payment', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const { customerId, amount, note } = req.body || {};
    if (!customerId || amount == null || Number(amount) <= 0) {
      return res.status(400).json({ error: 'customerId and positive amount are required' });
    }
    const id = await getKhataService().addCredit(req.tenantId, customerId, Number(amount), note || undefined);
    res.status(201).json({ id, message: 'Payment recorded' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/customers', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const customers = await getKhataService().listCustomers(req.tenantId);
    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
