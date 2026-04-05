/**
 * POS offline product sync: queue product when offline, upload image then create when online.
 */

import { shopApi } from './shopApi';
import {
  addPendingProduct,
  getAllPendingProducts,
  setProductStatus,
  removePendingProduct,
  getLocalImageBlob,
  removeLocalImageBlob,
  type PendingProductPayload,
} from './productSyncStore';

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export async function processPendingProductQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const pending = await getAllPendingProducts();
  let succeeded = 0;
  let failed = 0;
  for (const item of pending) {
    if (!isOnline()) break;
    await setProductStatus(item.localId, 'syncing');
    try {
      let imageUrl: string | undefined;
      const { localImageId, ...rest } = item.payload;
      if (localImageId) {
        const blob = await getLocalImageBlob(localImageId);
        if (blob) {
          const file = new File([blob], 'product-image', { type: blob.type || 'image/jpeg' });
          const res = await shopApi.uploadImage(file);
          imageUrl = res.imageUrl;
          await removeLocalImageBlob(localImageId);
        }
      }
      const payload: any = {
        ...rest,
        image_url: imageUrl || null,
        mobile_description: rest.description ?? null,
      };
      const result = await shopApi.createProduct(payload) as {
        success?: boolean;
        message?: string;
        data?: { id?: string };
        id?: string;
      };
      const serverId = result?.data?.id ?? result?.id;
      if (!result?.success || !serverId) {
        await setProductStatus(item.localId, 'failed', undefined, result?.message ?? 'Create rejected');
        failed++;
        continue;
      }
      await setProductStatus(item.localId, 'synced', serverId);
      await removePendingProduct(item.localId);
      succeeded++;
    } catch (err: any) {
      await setProductStatus(item.localId, 'failed', undefined, err?.message ?? 'Sync failed');
      failed++;
    }
  }
  return { processed: pending.length, succeeded, failed };
}

export function subscribeToOnline(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
