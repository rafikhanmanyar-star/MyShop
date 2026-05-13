import express from 'express';
import fs from 'node:fs';
import path from 'path';
import { checkRole } from '../../middleware/roleMiddleware.js';
import type { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { requireReportPermission } from '../../services/reporting/reportPermissions.js';
import { getReportingPersistenceService } from '../../services/reporting/reportingPersistenceService.js';
import { getReportingAnalyticsService } from '../../services/reporting/reportingAnalyticsService.js';
import { getReportingAuditService } from '../../services/reporting/reportingAuditService.js';
import { REPORT_CATALOG, findCatalogEntry } from '../../services/reporting/reportCatalog.js';
import { runReportDataQuery } from '../../services/reporting/reportQueryRunner.js';

const router = express.Router();

const analyst = [checkRole(['admin', 'accountant']), requireReportPermission('reports.view')];

const uploadsRoot = path.resolve(process.cwd(), 'uploads');

router.get('/catalog', ...analyst, (_req: TenantRequest, res) => {
  res.json({ items: REPORT_CATALOG });
});

router.get('/data/:category/:reportSlug', ...analyst, async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const category = String(req.params.category || '');
    const reportSlug = String(req.params.reportSlug || '');
    const dateFrom = String(req.query.from || '').slice(0, 10);
    const dateTo = String(req.query.to || '').slice(0, 10);
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 5000);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    if (!findCatalogEntry(category, reportSlug)) {
      return res.status(404).json({ error: 'Unknown report', code: 'UNKNOWN_REPORT' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid date range', code: 'BAD_RANGE' });
    }
    const data = await runReportDataQuery(category, reportSlug, {
      tenantId,
      dateFrom,
      dateTo,
      branchId,
      limit,
      offset,
    });
    res.json({ meta: { category, reportSlug, limit, offset }, ...data });
  } catch (e: any) {
    console.error('[reports] data', e);
    res.status(500).json({ error: 'Report query failed', message: e?.message });
  }
});

router.get('/executive-summary', ...analyst, requireReportPermission('reports.financial'), async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const dateFrom = String(req.query.from || '').slice(0, 10);
    const dateTo = String(req.query.to || '').slice(0, 10);
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid date range', code: 'BAD_RANGE' });
    }
    const svc = getReportingAnalyticsService();
    const data = await svc.getExecutiveSummary({ tenantId, dateFrom, dateTo, branchId });
    res.json(data);
  } catch (e: any) {
    console.error('[reports] executive-summary', e);
    res.status(500).json({ error: 'Failed to load executive summary', message: e?.message });
  }
});

router.get('/saved', ...analyst, async (req: TenantRequest, res) => {
  const rows = await getReportingPersistenceService().listSavedReports(req.tenantId!, req.userId!);
  res.json({ items: rows });
});

router.post('/saved', ...analyst, async (req: TenantRequest, res) => {
  const { name, categorySlug, definition, isShared } = req.body || {};
  if (!name || !categorySlug) {
    return res.status(400).json({ error: 'name and categorySlug are required' });
  }
  const out = await getReportingPersistenceService().createSavedReport({
    tenantId: req.tenantId!,
    userId: req.userId!,
    name: String(name),
    categorySlug: String(categorySlug),
    definition,
    isShared: Boolean(isShared) && req.user?.role === 'admin',
  });
  res.status(201).json(out);
});

router.delete('/saved/:id', ...analyst, async (req: TenantRequest, res) => {
  await getReportingPersistenceService().deleteSavedReport(
    req.tenantId!,
    req.userId!,
    req.params.id,
    req.user?.role || ''
  );
  res.json({ ok: true });
});

router.get('/templates', ...analyst, async (req: TenantRequest, res) => {
  const items = await getReportingPersistenceService().listTemplates(req.tenantId!);
  res.json({ items });
});

router.post('/templates', ...analyst, requireReportPermission('reports.custom'), async (req: TenantRequest, res) => {
  const { id, name, moduleKey, definition } = req.body || {};
  if (!name || !moduleKey) {
    return res.status(400).json({ error: 'name and moduleKey are required' });
  }
  const out = await getReportingPersistenceService().upsertTemplate({
    tenantId: req.tenantId!,
    userId: req.userId!,
    id: id ? String(id) : undefined,
    name: String(name),
    moduleKey: String(moduleKey),
    definition,
  });
  res.status(201).json(out);
});

router.get('/filter-presets', ...analyst, async (req: TenantRequest, res) => {
  const items = await getReportingPersistenceService().listFilterPresets(req.tenantId!, req.userId!);
  res.json({ items });
});

router.post('/filter-presets', ...analyst, async (req: TenantRequest, res) => {
  const { name, filters } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const out = await getReportingPersistenceService().createFilterPreset({
    tenantId: req.tenantId!,
    userId: req.userId!,
    name: String(name),
    filters,
  });
  res.status(201).json(out);
});

router.post(
  '/exports',
  checkRole(['admin', 'accountant']),
  requireReportPermission('reports.export'),
  async (req: TenantRequest, res) => {
    const { format, reportCategory, reportSlug, from, to, branchId, savedReportId } = req.body || {};
    if (!format) return res.status(400).json({ error: 'format is required' });
    const dateFrom = String(from || '').slice(0, 10);
    const dateTo = String(to || '').slice(0, 10);
    if (!reportCategory || !reportSlug) {
      return res.status(400).json({ error: 'reportCategory and reportSlug are required for async export' });
    }
    if (!findCatalogEntry(String(reportCategory), String(reportSlug))) {
      return res.status(400).json({ error: 'Unknown report', code: 'UNKNOWN_REPORT' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid date range', code: 'BAD_RANGE' });
    }
    const out = await getReportingPersistenceService().createExportJob({
      tenantId: req.tenantId!,
      userId: req.userId!,
      format: String(format),
      savedReportId: savedReportId ? String(savedReportId) : null,
      payload: {
        reportCategory: String(reportCategory),
        reportSlug: String(reportSlug),
        dateFrom,
        dateTo,
        branchId: branchId ? String(branchId) : null,
        format: String(format),
      },
    });
    res.status(202).json({
      ...out,
      message: 'Export queued. Poll GET /api/shop/reports/exports/:id until status is completed, then download.',
    });
  }
);

router.get(
  '/exports/:id',
  checkRole(['admin', 'accountant']),
  requireReportPermission('reports.export'),
  async (req: TenantRequest, res) => {
    const row = await getReportingPersistenceService().getExportJob(
      req.tenantId!,
      req.userId!,
      req.user?.role || '',
      req.params.id
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    const r = row as any;
    res.json({
      id: r.id,
      status: r.status,
      format: r.format,
      filePath: r.file_path,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    });
  }
);

router.get(
  '/exports/:id/download',
  checkRole(['admin', 'accountant']),
  requireReportPermission('reports.export'),
  async (req: TenantRequest, res) => {
    const row = await getReportingPersistenceService().getExportJob(
      req.tenantId!,
      req.userId!,
      req.user?.role || '',
      req.params.id
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    const r = row as any;
    if (r.status !== 'completed' || !r.file_path) {
      return res.status(409).json({ error: 'Export not ready', status: r.status });
    }
    const rel = String(r.file_path).replace(/\\/g, '/');
    if (rel.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const abs = path.resolve(uploadsRoot, rel);
    const root = path.resolve(uploadsRoot);
    if (!abs.startsWith(root)) return res.status(403).json({ error: 'Forbidden' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
    const name = path.basename(abs);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    fs.createReadStream(abs).pipe(res);
  }
);

router.get(
  '/audit/summary',
  checkRole(['admin']),
  requireReportPermission('reports.audit'),
  async (req: TenantRequest, res) => {
    const tenantId = req.tenantId!;
    const dateFrom = String(req.query.from || '').slice(0, 10);
    const dateTo = String(req.query.to || '').slice(0, 10);
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid date range', code: 'BAD_RANGE' });
    }
    const data = await getReportingAuditService().getAuditSummary({ tenantId, dateFrom, dateTo, branchId });
    res.json(data);
  }
);

export default router;
