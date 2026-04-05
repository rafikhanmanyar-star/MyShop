import { getDatabaseService } from './databaseService.js';

export type SystemLogInput = {
  tenantId: string;
  module: string;
  payload?: unknown;
  error: string;
};

/**
 * Persists a tenant-scoped log row. Does not throw (logging must not mask the original error).
 * Uses a standalone query so it never runs inside a rolled-back transaction.
 */
export async function insertSystemLog(input: SystemLogInput): Promise<void> {
  try {
    const db = getDatabaseService();
    let payloadJson: string | null = null;
    if (input.payload !== undefined) {
      try {
        payloadJson = JSON.stringify(input.payload);
      } catch {
        payloadJson = '"[unserializable]"';
      }
    }
    await db.query(
      `INSERT INTO system_logs (tenant_id, module, payload, error) VALUES ($1, $2, $3::jsonb, $4)`,
      [input.tenantId, input.module, payloadJson, input.error]
    );
  } catch (e) {
    console.error('[system_logs] insert failed:', e);
  }
}
