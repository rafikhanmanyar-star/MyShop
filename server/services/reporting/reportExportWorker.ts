import fs from 'node:fs';
import path from 'path';
import { getDatabaseService } from '../databaseService.js';
import { runWithTenantContext } from '../tenantContext.js';
import { runReportDataQuery, resultToCsv } from './reportQueryRunner.js';

export type ExportJobPayload = {
  reportCategory: string;
  reportSlug: string;
  dateFrom: string;
  dateTo: string;
  branchId?: string | null;
  format: 'csv' | 'xlsx' | 'pdf';
};

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads');
}

async function processJobRow(row: any): Promise<void> {
  const db = getDatabaseService();
  const jobId = row.id as string;
  const tenantId = row.tenant_id as string;
  const userId = row.user_id as string;
  let payload: ExportJobPayload;
  try {
    payload = JSON.parse(row.payload || '{}') as ExportJobPayload;
  } catch {
    await db.execute(`UPDATE report_exports SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`, [
      jobId,
      'Invalid job payload',
    ]);
    return;
  }

  if (payload.format !== 'csv') {
    await db.execute(`UPDATE report_exports SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`, [
      jobId,
      'Async worker currently supports CSV only; use client-side export for PDF/XLSX.',
    ]);
    return;
  }

  await runWithTenantContext({ tenantId, userId }, async () => {
    try {
      const result = await runReportDataQuery(payload.reportCategory, payload.reportSlug, {
        tenantId,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
        branchId: payload.branchId ?? null,
        limit: 200_000,
        offset: 0,
      });
      const csv = resultToCsv(result);
      const dir = path.join(uploadsRoot(), 'exports', tenantId);
      fs.mkdirSync(dir, { recursive: true });
      const rel = path.join('exports', tenantId, `${jobId}.csv`).replace(/\\/g, '/');
      const abs = path.join(uploadsRoot(), rel);
      fs.writeFileSync(abs, csv, 'utf8');
      await db.execute(
        `UPDATE report_exports SET status = 'completed', file_path = $2, completed_at = NOW(), error_message = NULL WHERE id = $1`,
        [jobId, rel]
      );
    } catch (e: any) {
      const msg = (e?.message || String(e)).slice(0, 2000);
      await db.execute(`UPDATE report_exports SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`, [
        jobId,
        msg,
      ]);
    }
  });
}

export async function processOneReportExportJob(): Promise<boolean> {
  const db = getDatabaseService();
  const pending = await db.query(
    `SELECT id, tenant_id, user_id, payload, format
     FROM report_exports
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    []
  );
  if (!pending.length) return false;

  const row = pending[0] as any;
  await db.execute(`UPDATE report_exports SET status = 'processing' WHERE id = $1 AND status = 'pending'`, [row.id]);
  const check = await db.query(`SELECT status FROM report_exports WHERE id = $1`, [row.id]);
  if ((check[0] as any)?.status !== 'processing') {
    return true;
  }

  await processJobRow(row);
  return true;
}

export function startReportExportWorker(): void {
  if (process.env.DISABLE_REPORT_EXPORT_WORKER === 'true') {
    console.log('⏭️ Report export worker disabled (DISABLE_REPORT_EXPORT_WORKER=true)');
    return;
  }
  const ms = parseInt(process.env.REPORT_EXPORT_WORKER_MS || '4000', 10);
  const tick = () => {
    processOneReportExportJob().catch((e) => console.error('[report-export-worker]', e));
  };
  setTimeout(tick, 2000);
  setInterval(tick, Number.isFinite(ms) && ms >= 1000 ? ms : 4000);
  console.log(`🧵 Report export worker started (poll every ${Number.isFinite(ms) && ms >= 1000 ? ms : 4000}ms)`);
}
