import { getDatabaseService } from './databaseService.js';
import { notifyCustomerFeedbackUpdated } from './realtimeFeedbackNotify.js';

export type FeedbackType =
    | 'product_request'
    | 'complaint'
    | 'suggestion'
    | 'delivery_feedback'
    | 'app_feedback'
    | 'feature_request';

export type FeedbackStatus = 'submitted' | 'under_review' | 'responded' | 'resolved';
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent';

const FEEDBACK_TYPES = new Set<FeedbackType>([
    'product_request',
    'complaint',
    'suggestion',
    'delivery_feedback',
    'app_feedback',
    'feature_request',
]);

const STATUSES = new Set<FeedbackStatus>(['submitted', 'under_review', 'responded', 'resolved']);
const PRIORITIES = new Set<FeedbackPriority>(['low', 'normal', 'high', 'urgent']);

const URGENT_KEYWORDS = [
    'urgent', 'angry', 'furious', 'terrible', 'worst', 'never again', 'refund',
    'poison', 'unsafe', 'damaged', 'missing', 'not delivered', 'late',
];

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function sanitizeText(input: unknown, maxLen = 4000): string {
    if (input == null) return '';
    return String(input)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .trim()
        .slice(0, maxLen);
}

function clampRating(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) return null;
    return n;
}

function normalizeProductKey(productName: string, brand?: string | null): string {
    const parts = [productName, brand || '']
        .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
        .filter(Boolean);
    return parts.join('|') || 'unknown';
}

/** Smart priority: keywords, low ratings, complaint type, repeat issues. */
function computeSeverityAndPriority(input: {
    feedbackType: FeedbackType;
    message: string;
    overallRating?: number | null;
    deliveryRating?: number | null;
    productQualityRating?: number | null;
    recentComplaintCount?: number;
}): { severityScore: number; priority: FeedbackPriority } {
    let score = 0;
    const msg = input.message.toLowerCase();

    if (input.feedbackType === 'complaint') score += 30;
    if (input.feedbackType === 'delivery_feedback') score += 15;

    for (const kw of URGENT_KEYWORDS) {
        if (msg.includes(kw)) {
            score += 20;
            break;
        }
    }

    const ratings = [input.overallRating, input.deliveryRating, input.productQualityRating].filter(
        (r): r is number => r != null
    );
    if (ratings.some((r) => r <= 2)) score += 25;
    else if (ratings.some((r) => r === 3)) score += 10;

    if ((input.recentComplaintCount || 0) >= 2) score += 15;

    let priority: FeedbackPriority = 'normal';
    if (score >= 55) priority = 'urgent';
    else if (score >= 35) priority = 'high';
    else if (score <= 10) priority = 'low';

    return { severityScore: Math.min(100, score), priority };
}

function mapFeedbackRow(row: any, extras?: Record<string, unknown>) {
    return {
        id: row.id,
        feedback_type: row.feedback_type,
        message: row.message,
        status: row.status,
        priority: row.priority,
        severity_score: row.severity_score,
        order_id: row.order_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        created_at: row.created_at,
        updated_at: row.updated_at,
        overall_rating: row.overall_rating ?? null,
        delivery_rating: row.delivery_rating ?? null,
        product_quality_rating: row.product_quality_rating ?? null,
        product_request: row.product_name
            ? {
                  product_name: row.product_name,
                  brand: row.brand,
                  category: row.category,
                  notes: row.request_notes,
                  barcode: row.barcode,
              }
            : null,
        attachments: row.attachments_json ? JSON.parse(row.attachments_json) : [],
        replies: row.replies_json ? JSON.parse(row.replies_json) : undefined,
        reply_count: row.reply_count != null ? Number(row.reply_count) : undefined,
        demand_count: row.demand_count != null ? Number(row.demand_count) : undefined,
        ...extras,
    };
}

export class CustomerFeedbackService {
    private db = getDatabaseService();

    private isPg() {
        return this.db.getType() === 'postgres';
    }

    private likeOp() {
        return this.isPg() ? 'ILIKE' : 'LIKE';
    }

    private recentComplaintSql() {
        return this.isPg()
            ? `created_at >= NOW() - INTERVAL '30 days'`
            : `created_at >= datetime('now', '-30 days')`;
    }

    private async loadAttachments(tenantId: string, feedbackIds: string[]) {
        if (!feedbackIds.length) return new Map<string, { id: string; url: string; kind: string }[]>();
        const placeholders = feedbackIds.map((_, i) => `$${i + 2}`).join(', ');
        const rows = await this.db.query(
            `SELECT id, feedback_id, url, kind FROM feedback_attachments
             WHERE tenant_id = $1 AND feedback_id IN (${placeholders})
             ORDER BY created_at`,
            [tenantId, ...feedbackIds]
        );
        const map = new Map<string, { id: string; url: string; kind: string }[]>();
        for (const row of rows) {
            const list = map.get(row.feedback_id) || [];
            list.push({ id: row.id, url: row.url, kind: row.kind });
            map.set(row.feedback_id, list);
        }
        return map;
    }

    private async loadReplies(tenantId: string, feedbackId: string) {
        const rows = await this.db.query(
            `SELECT id, author_type, author_name, message, is_thank_you, created_at
             FROM feedback_replies WHERE tenant_id = $1 AND feedback_id = $2 ORDER BY created_at`,
            [tenantId, feedbackId]
        );
        return rows.map((r: any) => ({
            id: r.id,
            author_type: r.author_type,
            author_name: r.author_name,
            message: r.message,
            is_thank_you: !!r.is_thank_you,
            created_at: r.created_at,
        }));
    }

    async submitFeedback(
        tenantId: string,
        customerId: string,
        input: {
            feedbackType: FeedbackType;
            message?: string;
            orderId?: string | null;
            overallRating?: number | null;
            deliveryRating?: number | null;
            productQualityRating?: number | null;
            productRequest?: {
                productName?: string;
                brand?: string;
                category?: string;
                notes?: string;
                barcode?: string;
            } | null;
            attachmentUrls?: string[];
        }
    ) {
        const feedbackType = input.feedbackType;
        if (!FEEDBACK_TYPES.has(feedbackType)) {
            throw Object.assign(new Error('Invalid feedback type'), { statusCode: 400 });
        }

        const message = sanitizeText(input.message);
        if (!message && feedbackType !== 'product_request') {
            throw Object.assign(new Error('Message is required'), { statusCode: 400 });
        }

        if (input.orderId) {
            const orderRows = await this.db.query(
                'SELECT id FROM mobile_orders WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
                [input.orderId, tenantId, customerId]
            );
            if (!orderRows[0]) {
                throw Object.assign(new Error('Order not found'), { statusCode: 404 });
            }
        }

        const overallRating = clampRating(input.overallRating);
        const deliveryRating = clampRating(input.deliveryRating);
        const productQualityRating = clampRating(input.productQualityRating);

        const recentRows = await this.db.query(
            `SELECT COUNT(*) AS cnt FROM customer_feedback
             WHERE tenant_id = $1 AND customer_id = $2 AND feedback_type = 'complaint'
               AND ${this.recentComplaintSql()}`,
            [tenantId, customerId]
        );
        const recentComplaintCount = parseInt(recentRows[0]?.cnt || '0', 10);

        const { severityScore, priority } = computeSeverityAndPriority({
            feedbackType,
            message,
            overallRating,
            deliveryRating,
            productQualityRating,
            recentComplaintCount,
        });

        const feedbackId = generateId('cfb');
        const now = new Date().toISOString();

        await this.db.query(
            `INSERT INTO customer_feedback
             (id, tenant_id, customer_id, order_id, feedback_type, message, status, priority, severity_score, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7, $8, $9, $9)`,
            [
                feedbackId,
                tenantId,
                customerId,
                input.orderId || null,
                feedbackType,
                message,
                priority,
                severityScore,
                now,
            ]
        );

        if (overallRating || deliveryRating || productQualityRating) {
            await this.db.query(
                `INSERT INTO feedback_ratings
                 (id, tenant_id, feedback_id, overall_rating, delivery_rating, product_quality_rating)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    generateId('fbr'),
                    tenantId,
                    feedbackId,
                    overallRating,
                    deliveryRating,
                    productQualityRating,
                ]
            );
        }

        if (feedbackType === 'product_request' || input.productRequest?.productName) {
            const pr = input.productRequest || {};
            const productName = sanitizeText(pr.productName, 200);
            if (!productName) {
                throw Object.assign(new Error('Product name is required for product requests'), { statusCode: 400 });
            }
            const brand = sanitizeText(pr.brand, 120) || null;
            const category = sanitizeText(pr.category, 120) || null;
            const notes = sanitizeText(pr.notes, 500) || null;
            const barcode = sanitizeText(pr.barcode, 64) || null;
            const normalizedKey = normalizeProductKey(productName, brand);

            await this.db.query(
                `INSERT INTO product_requests
                 (id, tenant_id, feedback_id, customer_id, product_name, brand, category, notes, barcode, normalized_key, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    generateId('preq'),
                    tenantId,
                    feedbackId,
                    customerId,
                    productName,
                    brand,
                    category,
                    notes,
                    barcode,
                    normalizedKey,
                    now,
                ]
            );
        }

        const urls = (input.attachmentUrls || [])
            .map((u) => sanitizeText(u, 512))
            .filter((u) => u.startsWith('/uploads/feedback/'));
        for (const url of urls.slice(0, 5)) {
            await this.db.query(
                `INSERT INTO feedback_attachments (id, tenant_id, feedback_id, url, kind, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    generateId('fatt'),
                    tenantId,
                    feedbackId,
                    url,
                    feedbackType === 'product_request' ? 'recommendation' : 'photo',
                    now,
                ]
            );
        }

        await notifyCustomerFeedbackUpdated({
            tenantId,
            customerId,
            feedbackId,
            event: 'submitted',
            feedbackType,
            status: 'submitted',
            priority,
        });

        return this.getFeedbackById(tenantId, feedbackId, customerId);
    }

    async listCustomerFeedback(
        tenantId: string,
        customerId: string,
        opts?: { limit?: number; offset?: number }
    ) {
        const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
        const offset = Math.max(opts?.offset ?? 0, 0);

        const rows = await this.db.query(
            `SELECT f.*,
                    r.overall_rating, r.delivery_rating, r.product_quality_rating,
                    pr.product_name, pr.brand, pr.category, pr.notes AS request_notes, pr.barcode,
                    (SELECT COUNT(*) FROM feedback_replies fr WHERE fr.feedback_id = f.id AND fr.tenant_id = f.tenant_id) AS reply_count
             FROM customer_feedback f
             LEFT JOIN feedback_ratings r ON r.feedback_id = f.id AND r.tenant_id = f.tenant_id
             LEFT JOIN product_requests pr ON pr.feedback_id = f.id AND pr.tenant_id = f.tenant_id
             WHERE f.tenant_id = $1 AND f.customer_id = $2
             ORDER BY f.created_at DESC
             LIMIT $3 OFFSET $4`,
            [tenantId, customerId, limit, offset]
        );

        const attMap = await this.loadAttachments(tenantId, rows.map((r: any) => r.id));
        return rows.map((row: any) =>
            mapFeedbackRow({
                ...row,
                attachments_json: JSON.stringify(attMap.get(row.id) || []),
            })
        );
    }

    async getFeedbackById(tenantId: string, feedbackId: string, customerId?: string) {
        const rows = await this.db.query(
            `SELECT f.*,
                    mc.name AS customer_name, mc.phone AS customer_phone,
                    r.overall_rating, r.delivery_rating, r.product_quality_rating,
                    pr.product_name, pr.brand, pr.category, pr.notes AS request_notes, pr.barcode
             FROM customer_feedback f
             LEFT JOIN mobile_customers mc ON mc.id = f.customer_id AND mc.tenant_id = f.tenant_id
             LEFT JOIN feedback_ratings r ON r.feedback_id = f.id AND r.tenant_id = f.tenant_id
             LEFT JOIN product_requests pr ON pr.feedback_id = f.id AND pr.tenant_id = f.tenant_id
             WHERE f.tenant_id = $1 AND f.id = $2 ${customerId ? 'AND f.customer_id = $3' : ''}`,
            customerId ? [tenantId, feedbackId, customerId] : [tenantId, feedbackId]
        );
        if (!rows[0]) {
            throw Object.assign(new Error('Feedback not found'), { statusCode: 404 });
        }
        const attachments = await this.db.query(
            `SELECT id, url, kind FROM feedback_attachments WHERE tenant_id = $1 AND feedback_id = $2 ORDER BY created_at`,
            [tenantId, feedbackId]
        );
        const replies = await this.loadReplies(tenantId, feedbackId);
        return mapFeedbackRow({
            ...rows[0],
            attachments_json: JSON.stringify(attachments),
            replies_json: JSON.stringify(replies),
        });
    }

    async listShopFeedback(
        tenantId: string,
        filters: {
            type?: string;
            status?: string;
            priority?: string;
            search?: string;
            module?: string;
            limit?: number;
            offset?: number;
        }
    ) {
        const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
        const offset = Math.max(filters.offset ?? 0, 0);
        const params: unknown[] = [tenantId];
        let where = 'f.tenant_id = $1';
        let p = 2;

        const moduleMap: Record<string, { types?: FeedbackType[]; status?: FeedbackStatus }> = {
            all: {},
            product_requests: { types: ['product_request'] },
            complaints: { types: ['complaint'] },
            delivery: { types: ['delivery_feedback', 'complaint'] },
            suggestions: { types: ['suggestion', 'feature_request', 'app_feedback'] },
            resolved: { status: 'resolved' },
        };

        const mod = filters.module && moduleMap[filters.module] ? moduleMap[filters.module] : null;
        if (mod?.types) {
            const ph = mod.types.map((_, i) => `$${p + i}`).join(', ');
            where += ` AND f.feedback_type IN (${ph})`;
            params.push(...mod.types);
            p += mod.types.length;
        }
        if (mod?.status) {
            where += ` AND f.status = $${p}`;
            params.push(mod.status);
            p++;
        }

        if (filters.type && FEEDBACK_TYPES.has(filters.type as FeedbackType)) {
            where += ` AND f.feedback_type = $${p}`;
            params.push(filters.type);
            p++;
        }
        if (filters.status && STATUSES.has(filters.status as FeedbackStatus)) {
            where += ` AND f.status = $${p}`;
            params.push(filters.status);
            p++;
        }
        if (filters.priority && PRIORITIES.has(filters.priority as FeedbackPriority)) {
            where += ` AND f.priority = $${p}`;
            params.push(filters.priority);
            p++;
        }
        if (filters.search?.trim()) {
            const op = this.likeOp();
            where += ` AND (f.message ${op} $${p} OR mc.name ${op} $${p} OR mc.phone ${op} $${p} OR pr.product_name ${op} $${p})`;
            params.push(`%${filters.search.trim()}%`);
            p++;
        }

        params.push(limit, offset);

        const rows = await this.db.query(
            `SELECT f.*,
                    mc.name AS customer_name, mc.phone AS customer_phone,
                    r.overall_rating, r.delivery_rating, r.product_quality_rating,
                    pr.product_name, pr.brand, pr.category, pr.notes AS request_notes, pr.barcode, pr.normalized_key,
                    (SELECT COUNT(*) FROM feedback_replies fr WHERE fr.feedback_id = f.id AND fr.tenant_id = f.tenant_id) AS reply_count,
                    (SELECT COUNT(DISTINCT pr2.customer_id) FROM product_requests pr2
                     WHERE pr2.tenant_id = f.tenant_id AND pr.normalized_key IS NOT NULL
                       AND pr2.normalized_key = pr.normalized_key) AS demand_count
             FROM customer_feedback f
             LEFT JOIN mobile_customers mc ON mc.id = f.customer_id AND mc.tenant_id = f.tenant_id
             LEFT JOIN feedback_ratings r ON r.feedback_id = f.id AND r.tenant_id = f.tenant_id
             LEFT JOIN product_requests pr ON pr.feedback_id = f.id AND pr.tenant_id = f.tenant_id
             WHERE ${where}
             ORDER BY
               CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               f.created_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            params
        );

        const countRows = await this.db.query(
            `SELECT COUNT(*) AS total FROM customer_feedback f
             LEFT JOIN mobile_customers mc ON mc.id = f.customer_id AND mc.tenant_id = f.tenant_id
             LEFT JOIN product_requests pr ON pr.feedback_id = f.id AND pr.tenant_id = f.tenant_id
             WHERE ${where}`,
            params.slice(0, -2)
        );

        return {
            items: rows.map((row: any) => mapFeedbackRow(row)),
            total: parseInt(countRows[0]?.total || '0', 10),
            limit,
            offset,
        };
    }

    async replyToFeedback(
        tenantId: string,
        feedbackId: string,
        input: {
            authorType: 'staff' | 'customer';
            authorId?: string;
            authorName?: string;
            message: string;
            isThankYou?: boolean;
            newStatus?: FeedbackStatus;
            priority?: FeedbackPriority;
        }
    ) {
        const message = sanitizeText(input.message);
        if (!message) throw Object.assign(new Error('Message is required'), { statusCode: 400 });

        const fb = await this.getFeedbackById(tenantId, feedbackId);
        if (input.authorType === 'customer' && fb.customer_id !== input.authorId) {
            throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
        }

        const replyId = generateId('frep');
        const now = new Date().toISOString();
        await this.db.query(
            `INSERT INTO feedback_replies
             (id, tenant_id, feedback_id, author_type, author_id, author_name, message, is_thank_you, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                replyId,
                tenantId,
                feedbackId,
                input.authorType,
                input.authorId || null,
                sanitizeText(input.authorName, 120) || null,
                message,
                !!input.isThankYou,
                now,
            ]
        );

        let status: FeedbackStatus = input.newStatus && STATUSES.has(input.newStatus)
            ? input.newStatus
            : input.authorType === 'staff'
              ? 'responded'
              : fb.status;

        let priority = fb.priority as FeedbackPriority;
        if (input.priority && PRIORITIES.has(input.priority)) {
            priority = input.priority;
        }

        await this.db.query(
            `UPDATE customer_feedback SET status = $1, priority = $2, updated_at = $3 WHERE id = $4 AND tenant_id = $5`,
            [status, priority, now, feedbackId, tenantId]
        );

        await notifyCustomerFeedbackUpdated({
            tenantId,
            customerId: fb.customer_id,
            feedbackId,
            event: input.authorType === 'staff' ? 'staff_reply' : 'customer_reply',
            feedbackType: fb.feedback_type,
            status,
            priority,
            messagePreview: message.slice(0, 120),
        });

        return this.getFeedbackById(tenantId, feedbackId);
    }

    async updateFeedbackStatus(
        tenantId: string,
        feedbackId: string,
        input: { status?: FeedbackStatus; priority?: FeedbackPriority }
    ) {
        const fb = await this.getFeedbackById(tenantId, feedbackId);
        const status = input.status && STATUSES.has(input.status) ? input.status : fb.status;
        const priority = input.priority && PRIORITIES.has(input.priority) ? input.priority : fb.priority;
        const now = new Date().toISOString();

        await this.db.query(
            `UPDATE customer_feedback SET status = $1, priority = $2, updated_at = $3 WHERE id = $4 AND tenant_id = $5`,
            [status, priority, now, feedbackId, tenantId]
        );

        await notifyCustomerFeedbackUpdated({
            tenantId,
            customerId: fb.customer_id,
            feedbackId,
            event: 'status_updated',
            feedbackType: fb.feedback_type,
            status,
            priority,
        });

        return this.getFeedbackById(tenantId, feedbackId);
    }

    async getProductRequestAnalytics(tenantId: string, limit = 20) {
        const rows = await this.db.query(
            `SELECT pr.normalized_key,
                    MAX(pr.product_name) AS product_name,
                    MAX(pr.brand) AS brand,
                    MAX(pr.category) AS category,
                    COUNT(*) AS request_count,
                    COUNT(DISTINCT pr.customer_id) AS customer_count,
                    MAX(pr.created_at) AS last_requested_at
             FROM product_requests pr
             WHERE pr.tenant_id = $1
             GROUP BY pr.normalized_key
             HAVING COUNT(*) >= 1
             ORDER BY request_count DESC, last_requested_at DESC
             LIMIT $2`,
            [tenantId, Math.min(limit, 100)]
        );

        const brandRows = await this.db.query(
            `SELECT COALESCE(NULLIF(TRIM(brand), ''), 'Unknown') AS brand,
                    COUNT(*) AS request_count
             FROM product_requests
             WHERE tenant_id = $1
             GROUP BY 1
             ORDER BY request_count DESC
             LIMIT 10`,
            [tenantId]
        );

        return {
            topProducts: rows.map((r: any) => ({
                normalized_key: r.normalized_key,
                product_name: r.product_name,
                brand: r.brand,
                category: r.category,
                request_count: Number(r.request_count),
                customer_count: Number(r.customer_count),
                last_requested_at: r.last_requested_at,
                high_demand: Number(r.request_count) >= 3,
            })),
            trendingBrands: brandRows.map((r: any) => ({
                brand: r.brand,
                request_count: Number(r.request_count),
            })),
            summary: {
                total_requests: rows.reduce((s: number, r: any) => s + Number(r.request_count), 0),
                high_demand_count: rows.filter((r: any) => Number(r.request_count) >= 3).length,
            },
        };
    }

    async getFeedbackStats(tenantId: string) {
        const rows = await this.db.query(
            `SELECT
               SUM(CASE WHEN f.status != 'resolved' THEN 1 ELSE 0 END) AS open_count,
               SUM(CASE WHEN f.priority IN ('high', 'urgent') AND f.status != 'resolved' THEN 1 ELSE 0 END) AS urgent_count,
               SUM(CASE WHEN f.feedback_type = 'product_request' AND f.status != 'resolved' THEN 1 ELSE 0 END) AS product_requests_open,
               SUM(CASE WHEN f.feedback_type = 'complaint' AND f.status != 'resolved' THEN 1 ELSE 0 END) AS complaints_open,
               SUM(CASE WHEN f.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
               ROUND(AVG(r.overall_rating), 2) AS avg_overall_rating
             FROM customer_feedback f
             LEFT JOIN feedback_ratings r ON r.feedback_id = f.id AND r.tenant_id = f.tenant_id
             WHERE f.tenant_id = $1`,
            [tenantId]
        );
        return rows[0] || {};
    }
}

let instance: CustomerFeedbackService | null = null;
export function getCustomerFeedbackService(): CustomerFeedbackService {
    if (!instance) instance = new CustomerFeedbackService();
    return instance;
}
