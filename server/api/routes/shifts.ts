import express from 'express';
import { getShiftService } from '../../services/shiftService.js';
import { getShopService } from '../../services/shopService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

// --- Handover recipients (admin + cashiers; for dropdown on close) ---
router.get('/handover-recipients', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const users = await getShopService().getUsers(req.tenantId);
    const list = (users as any[])
      .filter((u) => u.role === 'admin' || u.role === 'pos_cashier')
      .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Cashier: current shift (own only) ---
router.get('/current', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const cashierId = req.userId;
    const terminalId = req.query.terminalId as string | undefined;
    const shift = await getShiftService().getCurrentShift(req.tenantId, cashierId, terminalId);
    res.json(shift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Cashier: start shift ---
router.post('/start', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const { terminalId, openingCash } = req.body;
    if (!terminalId || openingCash == null) {
      return res.status(400).json({ error: 'terminalId and openingCash are required' });
    }
    const shift = await getShiftService().startShift(
      req.tenantId,
      req.userId,
      terminalId,
      parseFloat(String(openingCash))
    );
    res.status(201).json(shift);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// --- Cashier: shift stats (must be own shift) ---
router.get('/:shiftId/stats', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const shift = await getShiftService().getShiftById(req.tenantId, req.params.shiftId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (req.userRole === 'pos_cashier' && shift.cashier_id !== req.userId) {
      return res.status(403).json({ error: 'You can only view your own shift stats' });
    }
    const stats = await getShiftService().getShiftStats(req.tenantId, req.params.shiftId);
    res.json(stats);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- Cashier: close shift (must be own shift) ---
router.post('/:shiftId/close', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const shift = await getShiftService().getShiftById(req.tenantId, req.params.shiftId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (req.userRole === 'pos_cashier' && shift.cashier_id !== req.userId) {
      return res.status(403).json({ error: 'You can only close your own shift' });
    }
    const closed = await getShiftService().closeShift(req.tenantId, req.params.shiftId, {
      closingCashActual: parseFloat(String(req.body.closingCashActual)),
      varianceReason: req.body.varianceReason,
      handoverToUserId: req.body.handoverToUserId,
      handoverAmount: req.body.handoverAmount != null ? parseFloat(String(req.body.handoverAmount)) : undefined,
    });
    res.json(closed);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- Cashier: handover logs for shift (own shift only for cashier) ---
router.get('/:shiftId/handovers', checkRole(['admin', 'pos_cashier']), async (req: any, res) => {
  try {
    const shift = await getShiftService().getShiftById(req.tenantId, req.params.shiftId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (req.userRole === 'pos_cashier' && shift.cashier_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const list = await getShiftService().listHandovers(req.tenantId, req.params.shiftId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Admin: shift summary (variance, by cashier) - must be before /:shiftId ---
router.get('/admin/summary', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const summary = await getShiftService().getAdminShiftSummary(req.tenantId, from, to);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Admin: list shifts (with filters) ---
router.get('/', checkRole(['admin', 'accountant', 'pos_cashier']), async (req: any, res) => {
  try {
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.cashierId) filters.cashierId = req.query.cashierId;
    if (req.query.terminalId) filters.terminalId = req.query.terminalId;
    if (req.query.from) filters.from = req.query.from;
    if (req.query.to) filters.to = req.query.to;
    if (req.query.limit) filters.limit = parseInt(String(req.query.limit), 10);
    if (req.userRole === 'pos_cashier') {
      filters.cashierId = req.userId;
    }
    const list = await getShiftService().listShifts(req.tenantId, filters);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Admin: reopen shift ---
router.post('/:shiftId/reopen', checkRole(['admin']), async (req: any, res) => {
  try {
    const shift = await getShiftService().reopenShift(req.tenantId, req.params.shiftId, req.userId);
    res.json(shift);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- Get shift by id (cashier: own only) ---
router.get('/:shiftId', checkRole(['admin', 'pos_cashier', 'accountant']), async (req: any, res) => {
  try {
    const shift = await getShiftService().getShiftById(req.tenantId, req.params.shiftId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (req.userRole === 'pos_cashier' && shift.cashier_id !== req.userId) {
      return res.status(403).json({ error: 'You can only view your own shift' });
    }
    res.json(shift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
