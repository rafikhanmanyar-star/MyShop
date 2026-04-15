import express from 'express';
import { getTenantManagementService } from '../../services/tenantManagementService.js';

const router = express.Router();

/** GET /api/platform/tenants — list all tenants (paginated) */
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset != null ? parseInt(String(req.query.offset), 10) : 0;
    const data = await getTenantManagementService().listTenants(
      Number.isFinite(limit) ? limit : 50,
      Number.isFinite(offset) ? offset : 0
    );
    res.json(data);
  } catch (error: any) {
    console.error('[PlatformTenants] list:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/platform/tenants/:id — single tenant */
router.get('/:id', async (req, res) => {
  try {
    const row = await getTenantManagementService().getTenantById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json(row);
  } catch (error: any) {
    console.error('[PlatformTenants] get:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/platform/tenants/:id — update tenant */
router.patch('/:id', async (req, res) => {
  try {
    const row = await getTenantManagementService().updateTenant(req.params.id, req.body || {});
    res.json(row);
  } catch (error: any) {
    const msg = error.message || 'Update failed';
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    if (msg.includes('already uses')) return res.status(409).json({ error: msg });
    console.error('[PlatformTenants] patch:', msg);
    res.status(400).json({ error: msg });
  }
});

/**
 * DELETE /api/platform/tenants/:id
 * Requires query confirmTenantId=<id> to avoid accidental wipes (cascades to all tenant data).
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const confirm = typeof req.query.confirmTenantId === 'string' ? req.query.confirmTenantId.trim() : '';
    if (confirm !== id) {
      return res.status(400).json({
        error: 'Pass confirmTenantId query parameter matching the tenant id to confirm deletion',
        code: 'DELETE_CONFIRMATION_REQUIRED',
      });
    }
    await getTenantManagementService().deleteTenant(id);
    res.json({ success: true, deletedId: id });
  } catch (error: any) {
    const msg = error.message || 'Delete failed';
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    console.error('[PlatformTenants] delete:', msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
