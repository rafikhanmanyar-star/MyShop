import express from 'express';
import { checkRole } from '../../middleware/roleMiddleware.js';
import { getDataImportService } from '../../services/dataImportService.js';
import { getBackupService } from '../../services/backupService.js';

const router = express.Router();

// --- Backup and restore (full database) ---
router.get(
  '/backups',
  checkRole(['admin', 'accountant']),
  async (_req: any, res) => {
    try {
      const list = await getBackupService().listBackups();
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to list backups' });
    }
  }
);

router.post(
  '/backups',
  checkRole(['admin', 'accountant']),
  async (_req: any, res) => {
    try {
      const result = await getBackupService().createBackup();
      res.status(201).json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to create backup' });
    }
  }
);

router.post(
  '/backups/restore',
  checkRole(['admin']),
  async (req: any, res) => {
    try {
      const filename = req.body?.filename ?? req.body?.id;
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'Backup filename is required' });
      }
      await getBackupService().restoreBackup(filename);
      res.json({ success: true, message: 'Database restored. You may need to refresh the app.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to restore backup' });
    }
  }
);

router.post(
  '/import/skus',
  checkRole(['admin', 'accountant']),
  async (req: any, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const result = await getDataImportService().validateAndImportSkus(req.tenantId, rows);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, errors: [{ row: 0, message: e.message || 'Import failed' }] });
    }
  }
);

router.post(
  '/import/inventory',
  checkRole(['admin', 'accountant']),
  async (req: any, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const result = await getDataImportService().validateAndImportInventory(req.tenantId, rows);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, errors: [{ row: 0, message: e.message || 'Import failed' }] });
    }
  }
);

router.post(
  '/import/bills',
  checkRole(['admin', 'accountant']),
  async (req: any, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const result = await getDataImportService().validateAndImportBills(req.tenantId, rows);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, errors: [{ row: 0, message: e.message || 'Import failed' }] });
    }
  }
);

router.post(
  '/import/payments',
  checkRole(['admin', 'accountant']),
  async (req: any, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const result = await getDataImportService().validateAndImportPayments(req.tenantId, rows);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, errors: [{ row: 0, message: e.message || 'Import failed' }] });
    }
  }
);

export default router;
