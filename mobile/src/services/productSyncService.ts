/**
 * Offline product/SKU sync: queue new product creation when offline,
 * POST to API when back online. Data is stored in local DB permanently;
 * we only remove a pending product record after it has been successfully
 * synced to the cloud.
 */

import { publicApi } from '../api';
import {
    addPendingProduct,
    getAllPendingProducts,
    setProductStatus,
    removePendingProduct,
    getLocalImageBlob,
    removeLocalImageBlob,
    saveLocalImageBlob,
    type PendingProductPayload,
} from './productSyncStore';

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Create product via API; if offline or network error, save to local queue. Optionally pass imageFile to queue for upload when syncing. */
export async function createProductOfflineFirst(
    shopSlug: string,
    payload: PendingProductPayload,
    imageFile?: File
): Promise<{ synced: boolean; localId?: string; productId?: string; error?: string }> {
    let payloadToUse = { ...payload };
    if (imageFile && !isOnline()) {
        const localImageId = await saveLocalImageBlob(imageFile);
        payloadToUse = { ...payloadToUse, localImageId };
    }
    if (isOnline()) {
        try {
            let imageUrl: string | undefined;
            if (imageFile) {
                const up = await publicApi.uploadImage(shopSlug, imageFile);
                imageUrl = up.imageUrl;
            }
            const { localImageId: _, ...createPayload } = payloadToUse;
            const result = await publicApi.createProduct(shopSlug, { ...createPayload, image_url: imageUrl });
            const productId = result?.id ?? (result as any)?.productId;
            return { synced: true, productId };
        } catch (err: any) {
            const isNetworkError =
                err?.message?.includes('fetch') ||
                err?.message?.includes('network') ||
                err?.message?.includes('Failed to fetch');
            if (!isOnline() || isNetworkError) {
                const localId = await addPendingProduct(shopSlug, payloadToUse);
                return { synced: false, localId };
            }
            return {
                synced: false,
                error: err?.message ?? 'Request failed',
            };
        }
    }
    const localId = await addPendingProduct(shopSlug, payloadToUse);
    return { synced: false, localId };
}

/** Process all pending products: upload image if any, then POST product to the API; remove on success. */
export async function processPendingProductQueue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}> {
    const pending = await getAllPendingProducts();
    let succeeded = 0;
    let failed = 0;
    for (const item of pending) {
        if (!isOnline()) break;
        await setProductStatus(item.localId, 'syncing');
        try {
            let imageUrl: string | undefined;
            const { localImageId, ...restPayload } = item.payload;
            if (localImageId) {
                const blob = await getLocalImageBlob(localImageId);
                if (blob) {
                    const file = new File([blob], 'product-image', { type: blob.type || 'image/jpeg' });
                    const up = await publicApi.uploadImage(item.shopSlug, file);
                    imageUrl = up.imageUrl;
                    await removeLocalImageBlob(localImageId);
                }
            }
            const createPayload = { ...restPayload, image_url: imageUrl };
            const result = await publicApi.createProduct(item.shopSlug, createPayload);
            const serverProductId = result?.id ?? (result as any)?.productId;
            await setProductStatus(item.localId, 'synced', serverProductId);
            await removePendingProduct(item.localId);
            succeeded++;
        } catch (err: any) {
            const message = err?.message ?? 'Sync failed';
            await setProductStatus(item.localId, 'failed', undefined, message);
            failed++;
        }
    }
    return {
        processed: pending.length,
        succeeded,
        failed,
    };
}

export { getAllPendingProducts, getPendingProductCount } from './productSyncStore';
export type { PendingProductItem, PendingProductPayload } from './productSyncStore';
