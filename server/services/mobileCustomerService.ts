import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { normalizeShopSlugForLookup } from '../utils/shopSlug.js';
import { getDatabaseService } from './databaseService.js';
import { getCustomerIdentityService, assertMobilePasswordValid } from './customerIdentityService.js';

const JWT_EXPIRY = '30d';

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    private identity = getCustomerIdentityService();

    private phoneDigits(raw: string): string {
        return String(raw || '').replace(/\D/g, '');
    }

    // ─── Tenant / Shop Discovery ────────────────────────────────────────
    async resolveShopBySlug(slug: string): Promise<{ id: string; name: string; company_name: string; logo_url?: string; brand_color?: string; slug: string; branchId?: string } | null> {
        const key = normalizeShopSlugForLookup(slug);
        if (!key) return null;

        const { getShopService } = await import('./shopService.js');
        const branch = await getShopService().getBranchBySlug(slug);
        if (branch) {
            const tenantRows = await this.db.query(
                `SELECT id, name, company_name, logo_url, brand_color FROM tenants WHERE id = $1`,
                [branch.tenant_id]
            );
            if (tenantRows.length === 0) return null;
            return {
                ...tenantRows[0],
                slug: branch.slug || key,
                branchId: branch.id,
            };
        }

        // Exact tenant slug match
        const rows = await this.db.query(
            `SELECT id, name, company_name, email, logo_url, brand_color, slug
       FROM tenants
       WHERE slug IS NOT NULL
         AND LOWER(TRIM(CAST(slug AS TEXT))) = $1`,
            [key]
        );

        if (rows.length > 0) {
            const tenant = rows[0];
            // Prefer branches with geo coordinates set (real branches, not auto-created placeholders)
            let firstBranch = await this.db.query(
                `SELECT id FROM shop_branches
                 WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
                   AND latitude IS NOT NULL AND longitude IS NOT NULL
                 ORDER BY name ASC LIMIT 1`,
                [tenant.id]
            );
            if (firstBranch.length === 0) {
                firstBranch = await this.db.query(
                    'SELECT id FROM shop_branches WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE ORDER BY name ASC LIMIT 1',
                    [tenant.id]
                );
            }
            return {
                ...tenant,
                branchId: firstBranch.length > 0 ? firstBranch[0].id : undefined,
            };
        }

        // Generated branch slug: {tenantSlug}-{branchCode} (from /branches endpoint)
        // Try every dash position since tenant slugs can contain dashes
        for (let i = key.length - 1; i > 0; i--) {
            if (key[i] !== '-') continue;
            const possibleTenantSlug = key.substring(0, i);
            const branchSuffix = key.substring(i + 1);
            if (!possibleTenantSlug || !branchSuffix) continue;

            const tenantRows = await this.db.query(
                `SELECT id, name, company_name, email, logo_url, brand_color, slug
           FROM tenants
           WHERE slug IS NOT NULL
             AND LOWER(TRIM(CAST(slug AS TEXT))) = $1`,
                [possibleTenantSlug]
            );
            if (tenantRows.length > 0) {
                const tenant = tenantRows[0];
                const branchRows = await this.db.query(
                    `SELECT id FROM shop_branches
               WHERE tenant_id = $1
                 AND COALESCE(is_active, TRUE) = TRUE
                 AND LOWER(REGEXP_REPLACE(code, '[^a-zA-Z0-9]+', '-', 'g')) = $2`,
                    [tenant.id, branchSuffix]
                );
                if (branchRows.length > 0) {
                    return {
                        ...tenant,
                        branchId: branchRows[0].id,
                    };
                }
            }
        }

        return null;
    }

    async getOrCreateSlug(tenantId: string): Promise<string> {
        const tenants = await this.db.query(
            'SELECT slug, company_name, name FROM tenants WHERE id = $1',
            [tenantId]
        );
        if (tenants.length === 0) throw new Error('Tenant not found');

        const tenant = tenants[0];
        if (tenant.slug) return tenant.slug;

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

    async getMobileSettings(tenantId: string) {
        const rows = await this.db.query(
            'SELECT * FROM mobile_ordering_settings WHERE tenant_id = $1',
            [tenantId]
        );
        if (rows.length === 0) {
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
                rider_assignment_mode: 'auto',
            };
        }
        return rows[0];
    }

    async updateMobileSettings(tenantId: string, data: any) {
        const riderMode = data.rider_assignment_mode === 'manual' ? 'manual' : 'auto';
        const rows = await this.db.query(
            `INSERT INTO mobile_ordering_settings (
        tenant_id, is_enabled, minimum_order_amount, delivery_fee,
        free_delivery_above, max_delivery_radius_km, auto_confirm_orders,
        order_acceptance_start, order_acceptance_end, estimated_delivery_minutes,
        rider_assignment_mode, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
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
        rider_assignment_mode = EXCLUDED.rider_assignment_mode,
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
                riderMode,
            ]
        );
        return rows[0];
    }

    // ─── Authentication ─────────────────────────────────────────────

    async register(tenantId: string, phone: string, name: string, addressLine1: string, passwordString: string) {
        const phoneE164 = this.identity.normalizeInputToE164(phone);
        if (!phoneE164) {
            throw new Error('Invalid phone number format.');
        }
        assertMobilePasswordValid(passwordString);

        const wantDigits = this.phoneDigits(phoneE164);
        const mcRows = await this.db.query(
            `SELECT mc.id, c.phone_number FROM mobile_customers mc
       INNER JOIN customers c ON c.id = mc.id AND c.tenant_id = mc.tenant_id
       WHERE mc.tenant_id = $1`,
            [tenantId]
        );
        if ((mcRows as any[]).some((r) => this.phoneDigits(r.phone_number) === wantDigits)) {
            throw new Error('PHONE_ALREADY_REGISTERED');
        }

        let cust = await this.identity.findCustomerByTenantPhoneLoose(tenantId, phoneE164);

        if (cust) {
            await this.identity.setCustomerPasswordHash(cust.id, tenantId, passwordString);
            await this.db.execute(
                `UPDATE customers SET name = $1, address = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
                [name, addressLine1, cust.id, tenantId]
            );
            await this.identity.ensureMobileExtensionRow(tenantId, cust.id, {
                name,
                addressLine1,
            });
            await this.db.execute(
                `UPDATE mobile_customers SET phone = $1, name = $2, address_line1 = $3, updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
                [phoneE164, name, addressLine1, cust.id, tenantId]
            );
        } else {
            const customerId = generateId('mcust');
            const hashedPassword = await bcrypt.hash(passwordString, 10);
            try {
                await this.db.execute(
                    `INSERT INTO customers (
            id, tenant_id, name, phone_number, password, address, is_loyalty_member, created_from, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'MOBILE', NOW())`,
                    [customerId, tenantId, name, phoneE164, hashedPassword, addressLine1]
                );
            } catch (e: any) {
                const msg = String(e?.message || e || '');
                if (e?.code === '23505' || /unique|duplicate/i.test(msg)) {
                    throw new Error('PHONE_ALREADY_REGISTERED');
                }
                throw e;
            }
            await this.db.execute(
                `INSERT INTO mobile_customers (id, tenant_id, phone, name, address_line1, password, is_verified, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())`,
                [customerId, tenantId, phoneE164, name, addressLine1, hashedPassword]
            );
        }

        try {
            const { getShopService } = await import('./shopService.js');
            await getShopService().ensureLoyaltyMemberForMobileUser(tenantId, {
                phone: phoneE164,
                name: name || 'Customer',
                email: null,
            });
        } catch (_loyaltyErr) {
            // best-effort
        }

        return this.login(tenantId, phone, passwordString);
    }

    async login(tenantId: string, phone: string, passwordString: string) {
        const phoneE164 = this.identity.normalizeInputToE164(phone);
        if (!phoneE164) {
            throw new Error('Invalid phone number or password');
        }

        const wantDigits = this.phoneDigits(phoneE164);
        const rows = await this.db.query(
            `SELECT mc.id, mc.is_blocked, mc.name, c.password AS cust_password, c.phone_number
       FROM mobile_customers mc
       INNER JOIN customers c ON c.id = mc.id AND c.tenant_id = mc.tenant_id
       WHERE mc.tenant_id = $1`,
            [tenantId]
        );
        const customer = (rows as any[]).find((r) => this.phoneDigits(r.phone_number) === wantDigits);
        if (!customer) {
            throw new Error('Invalid phone number or password');
        }

        if (customer.is_blocked) {
            throw new Error('This account has been blocked. Contact the shop for assistance.');
        }

        const pw = customer.cust_password;
        if (!pw) {
            throw new Error('Invalid phone number or password');
        }

        const isValid = await bcrypt.compare(passwordString, pw);
        if (!isValid) {
            throw new Error('Invalid phone number or password');
        }

        try {
            const { getShopService } = await import('./shopService.js');
            await getShopService().ensureLoyaltyMemberForMobileUser(tenantId, {
                phone: phoneE164,
                name: customer.name || 'Customer',
                email: null,
            });
        } catch (_loyaltyErr) {
            // best-effort
        }

        const tokenPhone = String(customer.phone_number || phoneE164);

        const token = jwt.sign(
            {
                type: 'mobile_customer',
                customerId: customer.id,
                tenantId,
                phone: tokenPhone,
            },
            process.env.JWT_SECRET!,
            { expiresIn: JWT_EXPIRY }
        );

        let loyalty: { total_points?: number; points_value?: number; redemption_ratio?: number; last_updated?: string | null } = {};
        try {
            const { getShopService } = await import('./shopService.js');
            loyalty = await getShopService().getLoyaltyPointsForMobileCustomer(tenantId, customer.id);
        } catch {
            loyalty = {};
        }

        return {
            token,
            customerId: customer.id,
            tenantId,
            phone: tokenPhone,
            name: customer.name || null,
            loyalty_points: loyalty.total_points ?? 0,
            loyalty_points_value: loyalty.points_value ?? 0,
            loyalty_redemption_ratio: loyalty.redemption_ratio,
            loyalty_last_updated: loyalty.last_updated ?? null,
        };
    }

    async changePassword(tenantId: string, customerId: string, oldPassword: string, newPassword: string) {
        assertMobilePasswordValid(newPassword);
        const rows = await this.db.query(
            `SELECT c.password FROM customers c
       INNER JOIN mobile_customers mc ON mc.id = c.id AND mc.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.id = $2`,
            [tenantId, customerId]
        );
        if (!rows.length || !rows[0].password) {
            throw new Error('Invalid phone number or password');
        }
        const ok = await bcrypt.compare(oldPassword, rows[0].password);
        if (!ok) {
            throw new Error('Invalid phone number or password');
        }
        await this.identity.setCustomerPasswordHash(customerId, tenantId, newPassword);
        return { success: true };
    }

    async getProfile(tenantId: string, customerId: string) {
        const rows = await this.db.query(
            `SELECT mc.id, c.phone_number AS phone, mc.name, mc.email, mc.address_line1, mc.address_line2,
              mc.city, mc.postal_code, mc.lat, mc.lng, mc.is_verified, mc.created_at
       FROM mobile_customers mc
       INNER JOIN customers c ON c.id = mc.id AND c.tenant_id = mc.tenant_id
       WHERE mc.tenant_id = $1 AND mc.id = $2`,
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
        if (data.name !== undefined || data.address_line1 !== undefined) {
            await this.db.execute(
                `UPDATE customers SET name = COALESCE($1, name), address = COALESCE($2, address), updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
                [data.name ?? null, data.address_line1 ?? null, customerId, tenantId]
            );
        }
        return this.getProfile(tenantId, customerId);
    }

    /** POS or in-person support: set mobile login password (unified customers.password). */
    async resetPasswordByShop(tenantId: string, customerId: string, newPassword: string) {
        assertMobilePasswordValid(newPassword);

        let rows = await this.db.query(
            'SELECT c.id FROM customers c WHERE c.tenant_id = $1 AND c.id = $2',
            [tenantId, customerId]
        );
        if (rows.length === 0) {
            rows = await this.db.query(
                `SELECT c.id FROM customers c
         INNER JOIN contacts ct ON ct.id = c.pos_contact_id AND ct.tenant_id = c.tenant_id
         WHERE c.tenant_id = $1 AND ct.id = $2`,
                [tenantId, customerId]
            );
        }
        if (rows.length === 0) {
            rows = await this.db.query(
                `SELECT c.id FROM customers c
         INNER JOIN contacts ct ON ct.tenant_id = c.tenant_id
         WHERE c.tenant_id = $1 AND ct.id = $2
           AND regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g')
             = regexp_replace(COALESCE(ct.contact_no, ''), '[^0-9]', '', 'g')`,
                [tenantId, customerId]
            );
        }
        if (rows.length === 0) {
            throw new Error('Customer not found.');
        }
        const cid = rows[0].id;
        await this.identity.setCustomerPasswordHash(cid, tenantId, newPassword);

        await this.db.execute(
            `UPDATE mobile_customers SET password = (SELECT password FROM customers WHERE id = $1 AND tenant_id = $2), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
            [cid, tenantId]
        );
        return { success: true };
    }
}

let instance: MobileCustomerService | null = null;
export function getMobileCustomerService(): MobileCustomerService {
    if (!instance) {
        instance = new MobileCustomerService();
    }
    return instance;
}
