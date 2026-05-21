import { voiceOrderApi } from '../api';
import {
    getPendingVoiceOrders,
    removePendingVoiceOrder,
    updatePendingVoiceOrder,
} from './voiceOrderSyncStore';

export async function processVoiceOrderQueue(): Promise<{ succeeded: number; failed: number }> {
    const pending = await getPendingVoiceOrders();
    let succeeded = 0;
    let failed = 0;
    for (const item of pending.filter((p) => p.status === 'pending' || p.status === 'failed')) {
        try {
            await updatePendingVoiceOrder(item.localId, { status: 'syncing' });
            const created = await voiceOrderApi.create({
                branchId: item.meta.branchId,
                notes: item.meta.notes,
                deliveryMode: item.meta.deliveryMode,
                deliveryAddress: item.meta.deliveryAddress,
                deliveryLat: item.meta.deliveryLat,
                deliveryLng: item.meta.deliveryLng,
                audioDurationSeconds: item.meta.audioDurationSeconds,
            });
            const orderId = created.id || created.order_id;
            if (!orderId) throw new Error('No order id');
            const ext = item.audioMime.includes('mp4') ? 'm4a' : item.audioMime.includes('mpeg') ? 'mp3' : 'webm';
            const file = new File([item.audioBlob], `voice.${ext}`, { type: item.audioMime });
            await voiceOrderApi.uploadAudio(orderId, file, item.meta.audioDurationSeconds);
            await removePendingVoiceOrder(item.localId);
            succeeded++;
        } catch (e) {
            failed++;
            await updatePendingVoiceOrder(item.localId, {
                status: 'failed',
                error: e instanceof Error ? e.message : 'Sync failed',
            });
        }
    }
    return { succeeded, failed };
}
