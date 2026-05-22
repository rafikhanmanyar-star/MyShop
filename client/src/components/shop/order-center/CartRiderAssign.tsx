import React, { useEffect, useState } from 'react';
import { Truck, User, Phone, Navigation, ExternalLink } from 'lucide-react';
import type { MobileOrder, PosRidersOverview } from '../../../services/mobileOrdersApi';
import { mobileOrdersApi } from '../../../services/mobileOrdersApi';
import { orderCenterApi } from '../../../services/orderCenterApi';

function isRiderAssignedDelivery(order: Pick<MobileOrder, 'payment_method' | 'rider_id' | 'delivery_order_id'>): boolean {
    if (order.payment_method === 'SelfCollection') return false;
    return !!(order.rider_id || order.delivery_order_id);
}

function formatCourierDeliveryStatus(ds: string | null | undefined): string {
    if (!ds) return '—';
    const map: Record<string, string> = {
        ASSIGNED: 'Assigned',
        PICKED: 'Picked up',
        ON_THE_WAY: 'On the way',
        DELIVERED: 'Delivered',
    };
    return map[String(ds).toUpperCase()] || String(ds).replace(/_/g, ' ');
}

function formatRiderOperationalStatus(s: string | null | undefined): string {
    if (!s) return '—';
    const map: Record<string, string> = { AVAILABLE: 'Available', BUSY: 'Busy', OFFLINE: 'Offline' };
    return map[String(s).toUpperCase()] || String(s);
}

interface Props {
    order: MobileOrder;
    ridersOverview: PosRidersOverview | null;
    riderAssignmentMode: 'auto' | 'manual' | 'third_party';
    onAssigned: () => void;
}

export function CartRiderAssign({ order, ridersOverview, riderAssignmentMode, onAssigned }: Props) {
    const [manualRiderId, setManualRiderId] = useState('');
    const [assigning, setAssigning] = useState(false);

    useEffect(() => {
        setManualRiderId('');
    }, [order.id]);

    const riderLocked = isRiderAssignedDelivery(order);
    const canManualAssign =
        order.payment_method !== 'SelfCollection' &&
        !riderLocked &&
        order.status !== 'Delivered' &&
        order.status !== 'Cancelled';

    const assignableRiders = (ridersOverview?.riders || []).filter(
        (r) => r.is_active && String(r.status).toUpperCase() === 'AVAILABLE'
    );

    const handleAssign = async () => {
        if (!manualRiderId) {
            alert('Select a rider');
            return;
        }
        setAssigning(true);
        try {
            await orderCenterApi.assignRider(order.id, manualRiderId);
            onAssigned();
        } catch (err: unknown) {
            const e = err as { error?: string; message?: string };
            alert(e.error || e.message || 'Failed to assign rider');
        } finally {
            setAssigning(false);
        }
    };

    if (!canManualAssign && !(order.rider_id || order.delivery_order_id)) return null;

    return (
        <div className="space-y-3">
            {canManualAssign && riderAssignmentMode === 'third_party' && (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                    Rider logistics uses third-party couriers. Track delivery outside the in-app rider workflow when needed.
                </div>
            )}

            {canManualAssign && riderAssignmentMode !== 'third_party' && (
                <div className="rounded-lg border border-dashed border-blue-300/80 bg-blue-50/30 px-3 py-3 dark:border-blue-800 dark:bg-blue-950/20">
                    <h4 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        Assign rider
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <select
                            aria-label="Choose rider"
                            value={manualRiderId}
                            onChange={(e) => setManualRiderId(e.target.value)}
                            className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600"
                        >
                            <option value="">Select rider…</option>
                            {assignableRiders.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            disabled={!manualRiderId || assigning}
                            onClick={() => void handleAssign()}
                            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {assigning ? 'Assigning…' : 'Assign'}
                        </button>
                    </div>
                    {assignableRiders.length === 0 && (
                        <p className="text-xs text-amber-800 dark:text-amber-200/90 mt-2">
                            No riders are Available. Riders must be on shift in the rider app.
                        </p>
                    )}
                </div>
            )}

            {(order.rider_id || order.delivery_order_id) && (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-900/80 dark:text-emerald-300/90 mb-2 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        Rider & courier
                    </h4>
                    <div className="space-y-2 text-sm">
                        {order.rider_name && (
                            <span className="flex items-center gap-1.5">
                                <User className="w-4 h-4 text-slate-400" />
                                <span className="font-medium">{order.rider_name}</span>
                            </span>
                        )}
                        {order.rider_phone && (
                            <span className="flex items-center gap-1.5">
                                <Phone className="w-4 h-4 text-slate-400" />
                                {order.rider_phone}
                            </span>
                        )}
                        <p className="text-xs">
                            Courier: <strong>{formatCourierDeliveryStatus(order.delivery_status)}</strong>
                            {' · '}
                            Rider: <strong>{formatRiderOperationalStatus(order.rider_operational_status)}</strong>
                        </p>
                        {order.rider_to_dropoff_km != null && Number.isFinite(order.rider_to_dropoff_km) && (
                            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                                <Navigation className="w-4 h-4" />
                                ~{order.rider_to_dropoff_km.toFixed(2)} km to drop-off
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Load riders overview — shared helper for Order Center ops */
export async function fetchRidersOverview(): Promise<PosRidersOverview | null> {
    try {
        return await mobileOrdersApi.getRidersOverview();
    } catch {
        return null;
    }
}
