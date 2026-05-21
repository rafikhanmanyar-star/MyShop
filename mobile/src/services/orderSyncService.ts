/**
 * Offline order sync: queue order when offline, POST to API when online.
 * Process queue on app load and when browser comes back online.
 */

import { customerApi } from '../api';
import {
    addPendingOrder,
    getAllPendingOrders,
    setOrderStatus,
    removePendingOrder,
    type PendingOrderPayload,
} from './orderSyncStore';

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Place order via API; if offline or network error, save to local queue. */
export async function placeOrderOfflineFirst(
    shopSlug: string,
    payload: PendingOrderPayload
): Promise<{ synced: boolean; localId?: string; orderId?: string; error?: string }> {
    if (isOnline()) {
        try {
            const preflightBody = {
                items: payload.items,
                offerBundles: payload.offerBundles,
                branchId: payload.branchId,
                deliveryAddress: payload.deliveryAddress,
                deliveryLat: payload.deliveryLat,
                deliveryLng: payload.deliveryLng,
                deliveryNotes: payload.deliveryNotes,
                paymentMethod: payload.paymentMethod,
                scheduledDeliveryAt: payload.scheduledDeliveryAt,
            };
            const pf = await customerApi.checkoutPreflight(preflightBody);
            if (!pf.ok) {
                return { synced: false, error: pf.error || 'Checkout validation failed' };
            }
            const result = await customerApi.placeOrder(payload as any);
            const orderId = result?.id ?? (result as any)?.order_number;
            return { synced: true, orderId };
        } catch (err: any) {
            const isNetworkError =
                err?.message?.includes('fetch') ||
                err?.message?.includes('network') ||
                err?.message?.includes('Failed to fetch');
            if (!isOnline() || isNetworkError) {
                const localId = await addPendingOrder(shopSlug, payload);
                return { synced: false, localId };
            }
            return {
                synced: false,
                error: err?.message ?? 'Request failed',
            };
        }
    }
    const localId = await addPendingOrder(shopSlug, payload);
    return { synced: false, localId };
}

/** Process all pending orders: POST each to the API and remove on success. */
export async function processOrderQueue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}> {
    const pending = await getAllPendingOrders();
    const activeSlug =
        typeof localStorage !== 'undefined'
            ? localStorage.getItem('myshop_last_shop_slug')
            : null;
    let succeeded = 0;
    let failed = 0;
    for (const item of pending) {
        if (!isOnline()) break;
        if (activeSlug && item.shopSlug !== activeSlug) continue;
        await setOrderStatus(item.localId, 'syncing');
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('myshop_last_shop_slug', item.shopSlug);
            }
            const result = await customerApi.placeOrder(item.payload as any);
            const serverOrderId = result?.id ?? (result as any)?.order_number;
            await setOrderStatus(item.localId, 'synced', serverOrderId);
            await removePendingOrder(item.localId);
            succeeded++;
        } catch (err: any) {
            const message = err?.message ?? 'Sync failed';
            const is401 = err?.message?.includes('401') || (err as any)?.status === 401;
            await setOrderStatus(item.localId, 'failed', undefined, message);
            failed++;
            if (is401) break;
        }
    }
    return {
        processed: pending.length,
        succeeded,
        failed,
    };
}

/** Subscribe to online event; callback when back online. Returns unsubscribe. */
export function subscribeToOnline(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => callback();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
}

export { getAllPendingOrders, getPendingOrderCount } from './orderSyncStore';
export type { PendingOrderItem, PendingOrderPayload } from './orderSyncStore';
