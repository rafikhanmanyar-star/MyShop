import { getDatabaseService } from './databaseService.js';

export type TenantRow = {
  id: string;
  name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  slug: string | null;
  logo_url: string | null;
  brand_color: string | null;
  settings: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const PATCHABLE = [
  'name',
  'company_name',
  'email',
  'phone',
  'address',
  'slug',
  'logo_url',
  'brand_color',
  'settings',
] as const;

type Patchable = (typeof PATCHABLE)[number];

function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class TenantManagementService {
  private db = getDatabaseService();

  async listTenants(limit = 50, offset = 0): Promise<{ tenants: TenantRow[]; total: number }> {
    const lim = Math.min(Math.max(1, limit), 200);
    const off = Math.max(0, offset);
    const countRows = await this.db.query<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM tenants`
    );
    const total = Number(countRows[0]?.n ?? 0) || 0;
    const tenants = (await this.db.query(
      `SELECT id, name, company_name, email, phone, address, slug, logo_url, brand_color, settings,
              created_at, updated_at
       FROM tenants
       ORDER BY created_at ASC
       LIMIT $1 OFFSET $2`,
      [lim, off]
    )) as TenantRow[];
    return { tenants: tenants.map((t) => this.normalizeRow(t)), total };
  }

  async getTenantById(id: string): Promise<TenantRow | null> {
    const rows = (await this.db.query(
      `SELECT id, name, company_name, email, phone, address, slug, logo_url, brand_color, settings,
              created_at, updated_at
       FROM tenants WHERE id = $1`,
      [id]
    )) as TenantRow[];
    if (rows.length === 0) return null;
    return this.normalizeRow(rows[0]);
  }

  /**
   * Update any tenant (platform). Validates unique email and slug.
   */
  async updateTenant(tenantId: string, body: Record<string, unknown>): Promise<TenantRow> {
    const patch = this.extractPatch(body);
    return this.applyPatch(tenantId, patch);
  }

  private extractPatch(body: Record<string, unknown>): Partial<Record<Patchable, unknown>> {
    const patch: Partial<Record<Patchable, unknown>> = {};
    for (const key of PATCHABLE) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = body[key];
      }
    }
    return patch;
  }

  private normalizeRow(row: TenantRow): TenantRow {
    return {
      ...row,
      settings: parseSettings(row.settings as unknown),
    };
  }

  private async applyPatch(tenantId: string, patch: Partial<Record<Patchable, unknown>>): Promise<TenantRow> {
    const existing = await this.getTenantById(tenantId);
    if (!existing) {
      throw new Error('Tenant not found');
    }

    if (patch.email !== undefined) {
      const email = String(patch.email || '').trim();
      if (!email) throw new Error('Email cannot be empty');
      const clash = await this.db.query(
        `SELECT id FROM tenants WHERE email = $1 AND id <> $2`,
        [email, tenantId]
      );
      if (clash.length > 0) throw new Error('Another tenant already uses this email');
    }

    if (patch.slug !== undefined && patch.slug !== null) {
      const slug = String(patch.slug).trim();
      if (slug) {
        const clash = await this.db.query(
          `SELECT id FROM tenants WHERE slug = $1 AND id <> $2`,
          [slug, tenantId]
        );
        if (clash.length > 0) throw new Error('Another tenant already uses this slug');
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    const push = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };

    if (patch.name !== undefined) push('name', String(patch.name || '').trim() || existing.name);
    if (patch.company_name !== undefined) {
      const v = patch.company_name;
      push('company_name', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.email !== undefined) push('email', String(patch.email || '').trim());
    if (patch.phone !== undefined) {
      const v = patch.phone;
      push('phone', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.address !== undefined) {
      const v = patch.address;
      push('address', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.slug !== undefined) {
      const v = patch.slug;
      push('slug', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.logo_url !== undefined) {
      const v = patch.logo_url;
      push('logo_url', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.brand_color !== undefined) {
      const v = patch.brand_color;
      push('brand_color', v === null || v === '' ? null : String(v).trim());
    }
    if (patch.settings !== undefined) {
      const cur = existing.settings || {};
      const incoming = patch.settings;
      let merged: Record<string, unknown>;
      if (incoming === null) {
        merged = {};
      } else if (typeof incoming === 'object' && !Array.isArray(incoming)) {
        merged = { ...cur, ...(incoming as Record<string, unknown>) };
      } else {
        throw new Error('settings must be a JSON object');
      }
      const settingsVal =
        this.db.getType() === 'postgres' ? merged : JSON.stringify(merged);
      push('settings', settingsVal);
    }

    if (sets.length === 0) {
      return existing;
    }

    const type = this.db.getType();
    if (type === 'postgres') {
      sets.push(`updated_at = NOW()`);
    } else {
      sets.push(`updated_at = datetime('now')`);
    }

    params.push(tenantId);
    await this.db.execute(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i}`,
      params
    );

    const updated = await this.getTenantById(tenantId);
    if (!updated) throw new Error('Tenant not found after update');
    return updated;
  }

  async deleteTenant(tenantId: string): Promise<void> {
    const n = await this.db.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if (n.length === 0) throw new Error('Tenant not found');
    await this.db.execute(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }
}

let instance: TenantManagementService | null = null;
export function getTenantManagementService(): TenantManagementService {
  if (!instance) instance = new TenantManagementService();
  return instance;
}
