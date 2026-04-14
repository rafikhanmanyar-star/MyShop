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

router.put('/ledger/:entryId', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const { entryId } = req.params;
    const { type, amount, note } = req.body || {};
    if (type !== 'debit' && type !== 'credit') {
      return res.status(400).json({ error: 'type must be debit or credit' });
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const ok = await getKhataService().updateEntry(req.tenantId, entryId, {
      type,
      amount: num,
      note: note === undefined ? undefined : note === null || note === '' ? null : String(note),
    });
    if (!ok) return res.status(404).json({ error: 'Ledger entry not found' });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/ledger/:entryId', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const { entryId } = req.params;
    const ok = await getKhataService().deleteEntry(req.tenantId, entryId);
    if (!ok) return res.status(404).json({ error: 'Ledger entry not found' });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/receive-payment', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const { customerId, amount, note, bankAccountId, applyToLedgerId } = req.body || {};
    if (!customerId || amount == null || Number(amount) <= 0) {
      return res.status(400).json({ error: 'customerId and positive amount are required' });
    }
    if (!bankAccountId || typeof bankAccountId !== 'string') {
      return res.status(400).json({ error: 'bankAccountId is required (deposit to chart-linked cash/bank account)' });
    }
    const id = await getKhataService().receivePayment(req.tenantId, {
      customerId,
      amount: Number(amount),
      note: note === undefined || note === null || String(note).trim() === '' ? undefined : String(note).trim(),
      bankAccountId,
      applyToLedgerId: typeof applyToLedgerId === 'string' && applyToLedgerId.trim() ? applyToLedgerId.trim() : null,
    });
    res.status(201).json({ id, message: 'Payment recorded' });
  } catch (error: any) {
    const msg = String(error?.message || '');
    const bad = /exceeds|already fully|not found|does not belong|only be applied/i.test(msg);
    res.status(bad ? 400 : 500).json({ error: error.message });
  }
});

router.get('/customers', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const customers = await getKhataService().listCustomers(req.tenantId, q ? { q } : undefined);
    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/customers', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const { name, contactNo, companyName } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = await getKhataService().createCustomer(req.tenantId, {
      name: name.trim(),
      contact_no: contactNo != null ? String(contactNo).trim() || undefined : undefined,
      company_name: companyName != null ? String(companyName).trim() || undefined : undefined,
    });
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
