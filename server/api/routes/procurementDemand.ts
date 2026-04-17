import express from 'express';
import { getProcurementDemandService } from '../../services/procurementDemandService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/analyze', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const salesWindowDays = req.query.salesWindowDays
      ? parseInt(req.query.salesWindowDays as string, 10)
      : undefined;
    const minimumDaysThreshold = req.query.minimumDaysThreshold
      ? parseInt(req.query.minimumDaysThreshold as string, 10)
      : undefined;
    const targetStockDays = req.query.targetStockDays
      ? parseInt(req.query.targetStockDays as string, 10)
      : undefined;

    const result = await getProcurementDemandService().generateDemandList(
      req.tenantId,
      { salesWindowDays, minimumDaysThreshold, targetStockDays }
    );
    res.json(result);
  } catch (e: any) {
    console.error('Procurement demand analysis error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/drafts', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const { name, items, settings } = req.body;
    if (!items?.length) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    const id = await getProcurementDemandService().saveDraft(
      req.tenantId,
      name || 'Purchase Draft',
      items,
      settings
    );
    res.status(201).json({ id, message: 'Draft saved' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/drafts', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const list = await getProcurementDemandService().getDrafts(req.tenantId);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/drafts/:id', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    const draft = await getProcurementDemandService().getDraftById(req.tenantId, req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json(draft);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/drafts/:id', checkRole(['admin', 'accountant']), async (req: any, res) => {
  try {
    await getProcurementDemandService().deleteDraft(req.tenantId, req.params.id);
    res.json({ message: 'Draft deleted' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
