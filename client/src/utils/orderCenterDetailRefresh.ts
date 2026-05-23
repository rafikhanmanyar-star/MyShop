import type { OrderCenterSsePayload } from '../context/OrderCenterContext';
import type { OrderCenterListItem } from '../types/orderCenter';

/** Whether an SSE event should reload the currently open Order Center detail. */
export function orderCenterDetailMatchesSse(
    selection: { kind: 'cart' | 'voice'; id: string },
    opts: {
        listItem?: OrderCenterListItem;
        /** From loaded cart detail — most reliable for voice-linked mobile orders. */
        linkedVoiceOrderId?: string | null;
    },
    payload: OrderCenterSsePayload
): boolean {
    if (selection.kind === 'voice') {
        return !!payload.voiceOrderId && payload.voiceOrderId === selection.id;
    }
    if (payload.orderId === selection.id || payload.mobileOrderId === selection.id) {
        return true;
    }
    const linked = opts.linkedVoiceOrderId || opts.listItem?.voice_order_id;
    if (payload.voiceOrderId && linked === payload.voiceOrderId) {
        return true;
    }
    return false;
}
