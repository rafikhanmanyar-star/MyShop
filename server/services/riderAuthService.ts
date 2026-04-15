import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from './databaseService.js';
import { getMobileCustomerService } from './mobileCustomerService.js';
import { assertMobilePasswordValid } from './customerIdentityService.js';

const JWT_EXPIRY = '30d';

function phoneDigits(raw: string): string {
    return String(raw || '').replace(/\D/g, '');
}

function generateRiderId(): string {
    return `rider_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export class RiderAuthService {
    private db = getDatabaseService();

    async login(shopSlug: string, phoneInput: string, passwordPlain: string) {
        const shop = await getMobileCustomerService().resolveShopBySlug(shopSlug);
        if (!shop) throw new Error('Shop not found');

        const tenantId = shop.id;
        const want = phoneDigits(phoneInput);
        if (!want) throw new Error('Invalid phone number or password');

        const rows = await this.db.query(
            `SELECT id, name, phone_number, password_hash, is_active, status
       FROM riders WHERE tenant_id = $1`,
            [tenantId]
        );
        const rider = (rows as any[]).find((r) => phoneDigits(r.phone_number) === want);
        if (!rider) {
            throw new Error('Invalid phone number or password');
        }
        if (!rider.is_active) {
            throw new Error('This rider account is disabled. Contact the shop.');
        }
        if (!rider.password_hash) {
            throw new Error('Account not ready for login. Ask the shop to set your password.');
        }

        const ok = await bcrypt.compare(passwordPlain, rider.password_hash);
        if (!ok) {
            throw new Error('Invalid phone number or password');
        }

        const token = jwt.sign(
            {
                type: 'rider',
                riderId: rider.id,
                tenantId,
                phone: rider.phone_number,
            },
            process.env.JWT_SECRET!,
            { expiresIn: JWT_EXPIRY }
        );

        return {
            token,
            riderId: rider.id,
            tenantId,
            name: rider.name,
            phone: rider.phone_number,
            status: rider.status,
        };
    }

    /** Admin (POS): create rider with phone password (same rules as mobile customer app). */
    async createRiderWithPassword(
        tenantId: string,
        data: { name: string; phone: string; password: string }
    ): Promise<{ id: string }> {
        assertMobilePasswordValid(data.password);
        const { getCustomerIdentityService } = await import('./customerIdentityService.js');
        const identity = getCustomerIdentityService();
        const e164 = identity.normalizeInputToE164(data.phone);
        if (!e164) throw new Error('Invalid phone number');

        const existing = await this.db.query(
            `SELECT id FROM riders WHERE tenant_id = $1 AND phone_number = $2`,
            [tenantId, e164]
        );
        if (existing.length > 0) {
            throw new Error('A rider with this phone number already exists.');
        }

        const hash = await bcrypt.hash(data.password, 10);
        const id = generateRiderId();
        await this.db.query(
            `INSERT INTO riders (id, tenant_id, name, phone_number, password_hash, is_active, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'OFFLINE', NOW(), NOW())`,
            [id, tenantId, data.name.trim(), e164, hash]
        );
        return { id };
    }

    async setPassword(tenantId: string, riderId: string, password: string) {
        assertMobilePasswordValid(password);
        const hash = await bcrypt.hash(password, 10);
        const res = await this.db.query(
            `UPDATE riders SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id`,
            [hash, riderId, tenantId]
        );
        if (res.length === 0) throw new Error('Rider not found');
    }
}

let inst: RiderAuthService | null = null;
export function getRiderAuthService(): RiderAuthService {
    if (!inst) inst = new RiderAuthService();
    return inst;
}
