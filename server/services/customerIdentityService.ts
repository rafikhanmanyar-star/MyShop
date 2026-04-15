import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDatabaseService } from './databaseService.js';
import {
  parsePakistanMobile,
  pakistanMobileDigitsToE164,
} from '../utils/pakistanMobile.js';

/** Mobile app login password: exactly 4 alphanumeric characters. */
export const MOBILE_PASSWORD_LENGTH = 4;

export function assertMobilePasswordValid(pw: string): void {
  if (!pw || typeof pw !== 'string') {
    throw new Error('Password is required.');
  }
  if (pw.length !== MOBILE_PASSWORD_LENGTH) {
    throw new Error(`Password must be exactly ${MOBILE_PASSWORD_LENGTH} characters.`);
  }
  if (!/^[a-zA-Z0-9]+$/.test(pw)) {
    throw new Error('Password may only contain letters and digits.');
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateFourCharPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < MOBILE_PASSWORD_LENGTH; i++) {
    s += chars[crypto.randomInt(0, chars.length)];
  }
  return s;
}

export class CustomerIdentityService {
  private db = getDatabaseService();

  /**
   * Accept raw input or 923… digits from the mobile client; returns +923… or null.
   */
  normalizeInputToE164(phoneInput: string): string | null {
    const trimmed = (phoneInput || '').trim();
    if (!trimmed) return null;
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (/^92\d{10}$/.test(digitsOnly)) {
      try {
        return pakistanMobileDigitsToE164(digitsOnly);
      } catch {
        return null;
      }
    }
    const p = parsePakistanMobile(trimmed);
    if (!p.ok) return null;
    try {
      return pakistanMobileDigitsToE164(p.digits);
    } catch {
      return null;
    }
  }

  async findCustomerByTenantPhone(tenantId: string, phoneE164: string) {
    const rows = await this.db.query(
      `SELECT * FROM customers WHERE tenant_id = $1 AND phone_number = $2 LIMIT 1`,
      [tenantId, phoneE164]
    );
    return rows[0] ?? null;
  }

  /** Match by digits if formatting differs (legacy rows). */
  async findCustomerByTenantPhoneLoose(tenantId: string, phoneE164: string) {
    const want = phoneE164.replace(/\D/g, '');
    const exact = await this.findCustomerByTenantPhone(tenantId, phoneE164);
    if (exact) return exact;
    const rows = await this.db.query(`SELECT * FROM customers WHERE tenant_id = $1`, [tenantId]);
    return (rows as any[]).find((r) => String(r.phone_number || '').replace(/\D/g, '') === want) ?? null;
  }

  /**
   * After POS creates a contact row, ensure unified customers + loyalty directory row exist.
   */
  async upsertFromPosContact(tenantId: string, contact: {
    id: string;
    name: string;
    contact_no?: string | null;
    address?: string | null;
  }): Promise<void> {
    const raw = contact.contact_no?.trim();
    if (!raw) return;

    const phoneE164 = this.normalizeInputToE164(raw);
    if (!phoneE164) return;

    const existing = await this.findCustomerByTenantPhoneLoose(tenantId, phoneE164);
    if (existing) {
      await this.db.execute(
        `UPDATE customers
         SET name = COALESCE($1, name),
             address = COALESCE($2, address),
             pos_contact_id = COALESCE($3, pos_contact_id),
             updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
        [contact.name, contact.address ?? null, contact.id, existing.id, tenantId]
      );
      return;
    }

    await this.db.execute(
      `INSERT INTO customers (
        id, tenant_id, name, phone_number, password, address, is_loyalty_member, created_from, pos_contact_id, updated_at
      ) VALUES ($1, $2, $3, $4, NULL, $5, TRUE, 'POS', $6, NOW())`,
      [contact.id, tenantId, contact.name, phoneE164, contact.address ?? null, contact.id]
    );
  }

  async ensureMobileExtensionRow(
    tenantId: string,
    customerId: string,
    data: {
      name: string;
      addressLine1: string;
      addressLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
    }
  ): Promise<void> {
    const rows = await this.db.query(
      `SELECT id FROM mobile_customers WHERE id = $1 AND tenant_id = $2`,
      [customerId, tenantId]
    );
    if (rows.length > 0) return;

    const cust = await this.db.query(
      `SELECT phone_number, name FROM customers WHERE id = $1 AND tenant_id = $2`,
      [customerId, tenantId]
    );
    if (!cust.length) throw new Error('Customer record not found.');

    await this.db.execute(
      `INSERT INTO mobile_customers (
        id, tenant_id, phone, name, address_line1, address_line2, city, postal_code,
        is_verified, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())`,
      [
        customerId,
        tenantId,
        cust[0].phone_number,
        data.name || cust[0].name,
        data.addressLine1,
        data.addressLine2 ?? null,
        data.city ?? null,
        data.postalCode ?? null,
      ]
    );
  }

  async setCustomerPasswordHash(customerId: string, tenantId: string, passwordPlain: string): Promise<void> {
    assertMobilePasswordValid(passwordPlain);
    const hashed = await bcrypt.hash(passwordPlain, 10);
    await this.db.execute(
      `UPDATE customers SET password = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [hashed, customerId, tenantId]
    );
  }

  async requestPasswordReset(tenantId: string, phoneE164: string): Promise<{ requestId: string }> {
    const cust = await this.findCustomerByTenantPhoneLoose(tenantId, phoneE164);
    if (!cust) {
      throw new Error('No account found for this phone number.');
    }

    const rid = generateId('prr');
    await this.db.execute(
      `INSERT INTO password_reset_requests (id, tenant_id, phone_number, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [rid, tenantId, phoneE164]
    );

    if (this.db.getType() === 'postgres') {
      try {
        const lmRows = await this.db.query(
          `SELECT id FROM shop_loyalty_members WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1`,
          [tenantId, cust.id]
        );
        const loyaltyMemberId = (lmRows[0] as { id: string } | undefined)?.id ?? null;
        const digits = phoneE164.replace(/\D/g, '');
        const payload = JSON.stringify({
          tenantId,
          requestId: rid,
          customerId: cust.id,
          customerName: String(cust.name || '').trim() || 'Customer',
          loyaltyMemberId,
          phoneHint: digits.length >= 4 ? digits.slice(-4) : digits,
        });
        await this.db.execute(`SELECT pg_notify('password_reset_request', $1)`, [payload]);
      } catch (e) {
        console.warn('[password_reset] pg_notify failed:', (e as Error)?.message);
      }
    }

    try {
      const { notifyPasswordResetPending } = await import('./whatsappCustomerNotify.js');
      await notifyPasswordResetPending(tenantId, phoneE164);
    } catch {
      // optional
    }

    return { requestId: rid };
  }

  async listPendingPasswordResets(tenantId: string) {
    return this.db.query(
      `SELECT id, phone_number, status, created_at
       FROM password_reset_requests
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [tenantId]
    );
  }

  async completePasswordResetFromPOS(
    tenantId: string,
    requestId: string
  ): Promise<{ newPassword: string; phoneE164: string }> {
    const reqRows = await this.db.query(
      `SELECT id, phone_number, status FROM password_reset_requests
       WHERE id = $1 AND tenant_id = $2`,
      [requestId, tenantId]
    );
    if (!reqRows.length) throw new Error('Request not found.');
    if (reqRows[0].status !== 'pending') throw new Error('This request was already completed.');

    const phoneE164 = String(reqRows[0].phone_number);
    const newPassword = generateFourCharPassword();
    const hashed = await bcrypt.hash(newPassword, 10);

    const cust = await this.findCustomerByTenantPhoneLoose(tenantId, phoneE164);
    if (!cust) throw new Error('Customer not found for this phone number.');

    await this.db.transaction(async (client) => {
      await client.execute(
        `UPDATE customers SET password = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [hashed, cust.id, tenantId]
      );
      await client.execute(
        `UPDATE password_reset_requests
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [requestId, tenantId]
      );
    });

    return { newPassword, phoneE164 };
  }
}

let instance: CustomerIdentityService | null = null;
export function getCustomerIdentityService(): CustomerIdentityService {
  if (!instance) instance = new CustomerIdentityService();
  return instance;
}
