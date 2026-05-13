import { getDatabaseService } from '../databaseService.js';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export class ReportingPersistenceService {
  async listSavedReports(tenantId: string, userId: string) {
    const db = getDatabaseService();
    const rows = await db.query(
      `SELECT id, name, category_slug, definition, is_shared, created_at, updated_at, user_id
       FROM saved_reports
       WHERE tenant_id = $1 AND (user_id = $2 OR is_shared = TRUE)
       ORDER BY updated_at DESC
       LIMIT 200`,
      [tenantId, userId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      categorySlug: r.category_slug,
      definition: parseJson(r.definition, {}),
      isShared: Boolean(r.is_shared),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ownerUserId: r.user_id,
    }));
  }

  async createSavedReport(input: {
    tenantId: string;
    userId: string;
    name: string;
    categorySlug: string;
    definition: unknown;
    isShared?: boolean;
  }) {
    const db = getDatabaseService();
    const id = generateId('svrep');
    const def = JSON.stringify(input.definition ?? {});
    await db.execute(
      `INSERT INTO saved_reports (id, tenant_id, user_id, name, category_slug, definition, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.tenantId, input.userId, input.name, input.categorySlug, def, Boolean(input.isShared)]
    );
    return { id };
  }

  async deleteSavedReport(tenantId: string, userId: string, id: string, role: string) {
    const db = getDatabaseService();
    if (role === 'admin') {
      await db.execute(`DELETE FROM saved_reports WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return;
    }
    await db.execute(
      `DELETE FROM saved_reports WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
      [tenantId, id, userId]
    );
  }

  async listTemplates(tenantId: string) {
    const db = getDatabaseService();
    const rows = await db.query(
      `SELECT id, name, module_key, definition, is_system, created_at
       FROM report_templates
       WHERE tenant_id = $1
       ORDER BY is_system DESC, name ASC
       LIMIT 500`,
      [tenantId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      moduleKey: r.module_key,
      definition: parseJson(r.definition, {}),
      isSystem: Boolean(r.is_system),
      createdAt: r.created_at,
    }));
  }

  async upsertTemplate(input: {
    tenantId: string;
    userId: string | null;
    id?: string;
    name: string;
    moduleKey: string;
    definition: unknown;
  }) {
    const db = getDatabaseService();
    const id = input.id ?? generateId('rptpl');
    const def = JSON.stringify(input.definition ?? {});
    if (input.id) {
      await db.execute(
        `UPDATE report_templates
         SET name = $3, module_key = $4, definition = $5, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, input.tenantId, input.name, input.moduleKey, def]
      );
      return { id };
    }
    await db.execute(
      `INSERT INTO report_templates (id, tenant_id, user_id, name, module_key, definition, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [id, input.tenantId, input.userId, input.name, input.moduleKey, def]
    );
    return { id };
  }

  async listFilterPresets(tenantId: string, userId: string) {
    const db = getDatabaseService();
    const rows = await db.query(
      `SELECT id, name, filters, created_at
       FROM report_filter_presets
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY updated_at DESC`,
      [tenantId, userId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      filters: parseJson(r.filters, {}),
      createdAt: r.created_at,
    }));
  }

  async createFilterPreset(input: { tenantId: string; userId: string; name: string; filters: unknown }) {
    const db = getDatabaseService();
    const id = generateId('rfpre');
    await db.execute(
      `INSERT INTO report_filter_presets (id, tenant_id, user_id, name, filters)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, input.tenantId, input.userId, input.name, JSON.stringify(input.filters ?? {})]
    );
    return { id };
  }

  async createExportJob(input: {
    tenantId: string;
    userId: string;
    format: string;
    savedReportId?: string | null;
    payload: unknown;
  }) {
    const db = getDatabaseService();
    const id = generateId('rpex');
    const payloadStr = JSON.stringify(input.payload ?? {});
    if (db.getType() === 'postgres') {
      await db.execute(
        `INSERT INTO report_exports (id, tenant_id, user_id, saved_report_id, format, status, payload)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)`,
        [id, input.tenantId, input.userId, input.savedReportId ?? null, input.format, payloadStr]
      );
    } else {
      await db.execute(
        `INSERT INTO report_exports (id, tenant_id, user_id, saved_report_id, format, status, payload)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [id, input.tenantId, input.userId, input.savedReportId ?? null, input.format, payloadStr]
      );
    }
    return { id, status: 'pending' as const };
  }

  async getExportJob(tenantId: string, userId: string, role: string, exportId: string) {
    const db = getDatabaseService();
    if (role === 'admin') {
      const rows = await db.query(`SELECT * FROM report_exports WHERE tenant_id = $1 AND id = $2`, [tenantId, exportId]);
      return rows[0] || null;
    }
    const rows = await db.query(
      `SELECT * FROM report_exports WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
      [tenantId, exportId, userId]
    );
    return rows[0] || null;
  }

  async registerExportJob(input: {
    tenantId: string;
    userId: string;
    format: string;
    savedReportId?: string | null;
  }) {
    return this.createExportJob({
      ...input,
      payload: { legacy: true, format: input.format, savedReportId: input.savedReportId },
    });
  }
}

let singleton: ReportingPersistenceService | null = null;

export function getReportingPersistenceService(): ReportingPersistenceService {
  if (!singleton) singleton = new ReportingPersistenceService();
  return singleton;
}
