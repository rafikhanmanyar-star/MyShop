import { getRiderDeliveryService } from './riderDeliveryService.js';
import { haversineDistanceKm } from '../utils/haversine.js';
import { getDrivingDurationSeconds } from './googleDirectionsEtaService.js';

type Stop = {
    order_id: string;
    order_number: string;
    customer_name: string;
    delivery_address: string;
    lat: number;
    lng: number;
    grand_total: number;
    delivery_status: string;
};

export type OptimizedRouteStop = Stop & {
    sequence: number;
    leg_km: number | null;
    leg_minutes: number | null;
};

/**
 * Greedy nearest-neighbor route from rider GPS through active delivery stops.
 * Uses Google Directions duration when API key is set; otherwise haversine estimate.
 */
export class RiderRouteOptimizationService {
    async optimizeForRider(tenantId: string, riderId: string, riderLat: number, riderLng: number) {
        const active = await getRiderDeliveryService().listForRider(tenantId, riderId, {
            bucket: 'active',
            limit: 20,
        });

        const stops: Stop[] = [];
        for (const o of active.orders as any[]) {
            const lat = o.delivery_lat != null ? parseFloat(String(o.delivery_lat)) : NaN;
            const lng = o.delivery_lng != null ? parseFloat(String(o.delivery_lng)) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            stops.push({
                order_id: o.order_id,
                order_number: o.order_number,
                customer_name: o.customer_name || 'Customer',
                delivery_address: o.delivery_address || '',
                lat,
                lng,
                grand_total: Number(o.grand_total) || 0,
                delivery_status: o.delivery_status,
            });
        }

        if (stops.length === 0) {
            return { stops: [] as OptimizedRouteStop[], total_km: 0, total_minutes: 0 };
        }

        const remaining = [...stops];
        const ordered: OptimizedRouteStop[] = [];
        let curLat = riderLat;
        let curLng = riderLng;
        let totalKm = 0;
        let totalMin = 0;
        let seq = 1;

        while (remaining.length > 0) {
            let bestIdx = 0;
            let bestScore = Infinity;
            for (let i = 0; i < remaining.length; i++) {
                const s = remaining[i];
                const km = haversineDistanceKm(curLat, curLng, s.lat, s.lng);
                if (km < bestScore) {
                    bestScore = km;
                    bestIdx = i;
                }
            }
            const next = remaining.splice(bestIdx, 1)[0];
            const legKm = Math.round(haversineDistanceKm(curLat, curLng, next.lat, next.lng) * 100) / 100;
            let legMin: number | null = Math.round((legKm / 25) * 60);
            const driveSec = await getDrivingDurationSeconds(curLat, curLng, next.lat, next.lng);
            if (driveSec != null) legMin = Math.round(driveSec / 60);

            totalKm += legKm;
            totalMin += legMin ?? 0;
            ordered.push({ ...next, sequence: seq++, leg_km: legKm, leg_minutes: legMin });
            curLat = next.lat;
            curLng = next.lng;
        }

        return {
            stops: ordered,
            total_km: Math.round(totalKm * 100) / 100,
            total_minutes: totalMin,
            origin: { lat: riderLat, lng: riderLng },
        };
    }
}

let routeInstance: RiderRouteOptimizationService | null = null;
export function getRiderRouteOptimizationService(): RiderRouteOptimizationService {
    if (!routeInstance) routeInstance = new RiderRouteOptimizationService();
    return routeInstance;
}
