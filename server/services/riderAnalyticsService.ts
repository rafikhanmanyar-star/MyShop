import { getDatabaseService } from './databaseService.js';

function safeNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export class RiderAnalyticsService {
    private db = getDatabaseService();

    async getRiderAnalytics(tenantId: string, riderId: string, days = 7) {
        const d = Math.min(Math.max(Number(days) || 7, 1), 90);
        const isPg = this.db.getType() === 'postgres';
        const sinceClause = isPg
            ? `d.created_at >= NOW() - INTERVAL '${d} days'`
            : `d.created_at >= datetime('now', '-${d} days')`;

        const summary = isPg
            ? await this.db.query(
                  `SELECT
         COUNT(*)::int AS total_deliveries,
         SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END)::int AS completed,
         SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed,
         SUM(CASE WHEN d.status = 'DELIVERED' THEN COALESCE(d.cod_collected, d.cod_expected, o.grand_total, 0) ELSE 0 END)::numeric AS cod_collected,
         AVG(
           CASE WHEN d.delivered_at IS NOT NULL AND d.assigned_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (d.delivered_at - d.assigned_at)) / 60
             ELSE NULL END
         )::float AS avg_delivery_minutes
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND ${sinceClause}`,
                  [tenantId, riderId]
              )
            : await this.db.query(
                  `SELECT
         COUNT(*) AS total_deliveries,
         SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN d.status = 'DELIVERED' THEN COALESCE(d.cod_collected, d.cod_expected, o.grand_total, 0) ELSE 0 END) AS cod_collected,
         NULL AS avg_delivery_minutes
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND ${sinceClause}`,
                  [tenantId, riderId]
              );

        const todayClause = isPg
            ? `d.delivered_at >= CURRENT_DATE`
            : `date(d.delivered_at) = date('now')`;

        const today = isPg
            ? await this.db.query(
                  `SELECT COUNT(*)::int AS delivered_today
       FROM delivery_orders d
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.status = 'DELIVERED' AND ${todayClause}`,
                  [tenantId, riderId]
              )
            : await this.db.query(
                  `SELECT COUNT(*) AS delivered_today
       FROM delivery_orders d
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.status = 'DELIVERED' AND ${todayClause}`,
                  [tenantId, riderId]
              );

        const distanceRows = await this.db.query(
            `SELECT o.distance_km
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.status = 'DELIVERED' AND ${sinceClause}
         AND o.distance_km IS NOT NULL`,
            [tenantId, riderId]
        );

        let distanceKm = 0;
        for (const r of distanceRows as { distance_km?: string | number }[]) {
            distanceKm += safeNum(r.distance_km);
        }

        const s = summary[0] || {};
        const total = safeNum(s.total_deliveries);
        const completed = safeNum(s.completed);
        const failed = safeNum(s.failed);
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 100;

        const daily = await this.db.query(
            isPg
                ? `SELECT DATE(d.delivered_at) AS day,
              COUNT(*)::int AS deliveries,
              SUM(COALESCE(d.cod_collected, d.cod_expected, o.grand_total, 0))::numeric AS cod
         FROM delivery_orders d
         INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.status = 'DELIVERED' AND ${sinceClause}
         GROUP BY DATE(d.delivered_at)
         ORDER BY day DESC`
                : `SELECT date(d.delivered_at) AS day,
              COUNT(*) AS deliveries,
              SUM(COALESCE(d.cod_collected, d.cod_expected, o.grand_total, 0)) AS cod
         FROM delivery_orders d
         INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.status = 'DELIVERED' AND ${sinceClause}
         GROUP BY date(d.delivered_at)
         ORDER BY day DESC`,
            [tenantId, riderId]
        );

        return {
            period_days: d,
            delivered_today: today[0]?.delivered_today ?? 0,
            total_deliveries: total,
            completed,
            failed,
            success_rate: successRate,
            cod_collected: safeNum(s.cod_collected),
            avg_delivery_minutes:
                s.avg_delivery_minutes != null ? Math.round(Number(s.avg_delivery_minutes)) : null,
            distance_km: Math.round(distanceKm * 100) / 100,
            customer_rating: null as number | null,
            daily: (daily as any[]).map((row) => ({
                day: String(row.day),
                deliveries: safeNum(row.deliveries),
                cod: safeNum(row.cod),
            })),
        };
    }

    async getFleetAnalytics(tenantId: string, days = 7) {
        const d = Math.min(Math.max(Number(days) || 7, 1), 90);
        const isPg = this.db.getType() === 'postgres';
        const sinceClause = isPg
            ? `d.created_at >= NOW() - INTERVAL '${d} days'`
            : `d.created_at >= datetime('now', '-${d} days')`;

        const rows = isPg
            ? await this.db.query(
                  `SELECT r.id, r.name, r.status,
              COUNT(d.id)::int AS deliveries,
              SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END)::int AS completed
       FROM riders r
       LEFT JOIN delivery_orders d ON d.rider_id = r.id AND d.tenant_id = r.tenant_id AND ${sinceClause}
       WHERE r.tenant_id = $1 AND r.is_active = TRUE
       GROUP BY r.id, r.name, r.status
       ORDER BY completed DESC, r.name ASC`,
                  [tenantId]
              )
            : await this.db.query(
                  `SELECT r.id, r.name, r.status,
              COUNT(d.id) AS deliveries,
              SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) AS completed
       FROM riders r
       LEFT JOIN delivery_orders d ON d.rider_id = r.id AND d.tenant_id = r.tenant_id AND ${sinceClause}
       WHERE r.tenant_id = $1 AND r.is_active = 1
       GROUP BY r.id, r.name, r.status
       ORDER BY completed DESC, r.name ASC`,
                  [tenantId]
              );
        return { period_days: d, riders: rows };
    }
}

let analyticsInstance: RiderAnalyticsService | null = null;
export function getRiderAnalyticsService(): RiderAnalyticsService {
    if (!analyticsInstance) analyticsInstance = new RiderAnalyticsService();
    return analyticsInstance;
}
