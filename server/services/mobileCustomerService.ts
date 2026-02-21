import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabaseService } from './databaseService.js';

const JWT_EXPIRY = '30d';
const OTP_EXPIRY_MINUTES = 5;
const OTP_LENGTH = 6;

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
}

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .substring(0, 50);
}

export class MobileCustomerService {
    private db = getDatabaseService();

    // ─── Tenant / Shop Discovery ────────────────────────────────────────

    async resolveShopBySlug(slug: string) {
        const rows = await this.db.query(
            `SELECT id, name, company_name, email, logo_url, brand_color, slug
       FROM tenants WHERE slug = $1`,
            [slug]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    async getOrCreateSlug(tenantId: string): Promise<string> {
        const tenants = await this.db.query(
            'SELECT slug, company_name, name FROM tenants WHERE id = $1',
            [tenantId]
        );
        if (tenants.length === 0) throw new Error('Tenant not found');

        const tenant = tenants[0];
        if (tenant.slug) return tenant.slug;

        // Auto-generate slug from company_name
        let baseSlug = slugify(tenant.company_name || tenant.name || 'shop');
        let slug = baseSlug;
        let counter = 1;

        while (true) {
            const existing = await this.db.query(
                'SELECT id FROM tenants WHERE slug = $1',
                [slug]
            );
            if (existing.length === 0) break;
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        await this.db.execute(
            'UPDATE tenants SET slug = $1 WHERE id = $2',
            [slug, tenantId]
        );
        return slug;
    }

    async updateTenantBranding(tenantId: string, data: {
        slug?: string;
        logo_url?: string;
        brand_color?: string;
    }) {
        if (data.slug) {
            // Validate slug format
            if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(data.slug)) {
                throw new Error('Invalid slug format. Use lowercase letters, numbers, and hyphens (3-50 chars).');
            }
            const existing = await this.db.query(
                'SELECT id FROM tenants WHERE slug = $1 AND id != $2',
                [data.slug, tenantId]
            );
            if (existing.length > 0) {
                throw new Error('This shop URL is already taken. Please choose another.');
            }
        }

        await this.db.execute(
            `UPDATE tenants
       SET slug = COALESCE($1, slug),
           logo_url = COALESCE($2, logo_url),
           brand_color = COALESCE($3, brand_color),
           updated_at = NOW()
       WHERE id = $4`,
            [data.slug || null, data.logo_url || null, data.brand_color || null, tenantId]
        );
    }

    // ─── Mobile Ordering Settings ───────────────────────────────────────

    async getMobileSettings(tenantId: string) {
        const rows = await this.db.query(
            'SELECT * FROM mobile_ordering_settings WHERE tenant_id = $1',
            [tenantId]
        );
        if (rows.length === 0) {
            // Return defaults without inserting
            return {
                tenant_id: tenantId,
                is_enabled: false,
                minimum_order_amount: 0,
                delivery_fee: 0,
                free_delivery_above: null,
                max_delivery_radius_km: null,
                auto_confirm_orders: false,
                order_acceptance_start: '09:00',
                order_acceptance_end: '21:00',
                estimated_delivery_minutes: 60,
            };
        }
        return rows[0];
    }

    async updateMobileSettings(tenantId: string, data: any) {
        const rows = await this.db.query(
            `INSERT INTO mobile_ordering_settings (
        tenant_id, is_enabled, minimum_order_amount, delivery_fee,
        free_delivery_above, max_delivery_radius_km, auto_confirm_orders,
        order_acceptance_start, order_acceptance_end, estimated_delivery_minutes,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        minimum_order_amount = EXCLUDED.minimum_order_amount,
        delivery_fee = EXCLUDED.delivery_fee,
        free_delivery_above = EXCLUDED.free_delivery_above,
        max_delivery_radius_km = EXCLUDED.max_delivery_radius_km,
        auto_confirm_orders = EXCLUDED.auto_confirm_orders,
        order_acceptance_start = EXCLUDED.order_acceptance_start,
        order_acceptance_end = EXCLUDED.order_acceptance_end,
        estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes,
        updated_at = NOW()
      RETURNING *`,
            [
                tenantId,
                data.is_enabled ?? false,
                data.minimum_order_amount ?? 0,
                data.delivery_fee ?? 0,
                data.free_delivery_above ?? null,
                data.max_delivery_radius_km ?? null,
                data.auto_confirm_orders ?? false,
                data.order_acceptance_start ?? '09:00',
                data.order_acceptance_end ?? '21:00',
                data.estimated_delivery_minutes ?? 60,
            ]
        );
        return rows[0];
    }

    // ─── Authentication ─────────────────────────────────────────────

    async register(tenantId: string, phone: string, name: string, addressLine1: string, passwordString: string) {
        // Upsert mobile_customer
        const customerId = generateId('mcust');
        const hashedPassword = await bcrypt.hash(passwordString, 10);

        await this.db.execute(
            `INSERT INTO mobile_customers (id, tenant_id, phone, name, address_line1, password, is_verified, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       ON CONFLICT (tenant_id, phone) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, mobile_customers.name),
         address_line1 = COALESCE(EXCLUDED.address_line1, mobile_customers.address_line1),
         password = EXCLUDED.password,
         is_verified = TRUE,
         updated_at = NOW()`,
            [customerId, tenantId, phone, name, addressLine1, hashedPassword]
        );

        return this.login(tenantId, phone, passwordString);
    }

    async login(tenantId: string, phone: string, passwordString: string) {
        const customers = await this.db.query(
            `SELECT id, password, is_blocked, name
       FROM mobile_customers
       WHERE tenant_id = $1 AND phone = $2`,
            [tenantId, phone]
        );

        if (customers.length === 0) {
            throw new Error('Phone number not found. Please register first.');
        }

        const customer = customers[0];

        if (customer.is_blocked) {
            throw new Error('This account has been blocked. Contact the shop for assistance.');
        }

        if (!customer.password) {
            throw new Error('Please register again to set up a password.');
        }

        const isValid = await bcrypt.compare(passwordString, customer.password);
        if (!isValid) {
            throw new Error('Invalid password. Please try again.');
        }

        // Generate JWT
        const token = jwt.sign(
            {
                type: 'mobile_customer',
                customerId: customer.id,
                tenantId,
                phone,
            },
            process.env.JWT_SECRET!,
            { expiresIn: JWT_EXPIRY }
        );

        return {
            token,
            customerId: customer.id,
            tenantId,
            phone,
            name: customer.name || null,
        };
    }

    // ─── Customer Profile ───────────────────────────────────────────────

    async getProfile(tenantId: string, customerId: string) {
        const rows = await this.db.query(
            `SELECT id, phone, name, email, address_line1, address_line2,
              city, postal_code, lat, lng, is_verified, created_at
       FROM mobile_customers
       WHERE tenant_id = $1 AND id = $2`,
            [tenantId, customerId]
        );
        if (rows.length === 0) throw new Error('Customer not found');
        return rows[0];
    }

    async updateProfile(tenantId: string, customerId: string, data: {
        name?: string;
        email?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        postal_code?: string;
        lat?: number;
        lng?: number;
    }) {
        await this.db.execute(
            `UPDATE mobile_customers
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           address_line1 = COALESCE($3, address_line1),
           address_line2 = COALESCE($4, address_line2),
           city = COALESCE($5, city),
           postal_code = COALESCE($6, postal_code),
           lat = COALESCE($7, lat),
           lng = COALESCE($8, lng),
           updated_at = NOW()
       WHERE tenant_id = $9 AND id = $10`,
            [
                data.name, data.email, data.address_line1, data.address_line2,
                data.city, data.postal_code, data.lat, data.lng,
                tenantId, customerId,
            ]
        );
        return this.getProfile(tenantId, customerId);
    }
}

let instance: MobileCustomerService | null = null;
export function getMobileCustomerService(): MobileCustomerService {
    if (!instance) {
        instance = new MobileCustomerService();
    }
    return instance;
}
