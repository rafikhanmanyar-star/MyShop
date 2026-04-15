/** In-app notification inbox (order SSE + budget alerts), persisted per shop slug. */

export type NotificationKind = 'order' | 'budget';

export interface CustomerNotificationItem {
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
    orderId?: string;
    /** Budget alert stable key for dedupe */
    budgetKey?: string;
}

const MAX_ITEMS = 80;

const listeners = new Set<() => void>();

function storageKey(shopSlug: string) {
    return `myshop_customer_notif_v1_${shopSlug}`;
}

export function subscribeCustomerNotifications(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function emitChange() {
    listeners.forEach((fn) => {
        try {
            fn();
        } catch {
            /* ignore */
        }
    });
}

function loadRaw(shopSlug: string): CustomerNotificationItem[] {
    if (!shopSlug || typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(storageKey(shopSlug));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveRaw(shopSlug: string, items: CustomerNotificationItem[]) {
    try {
        localStorage.setItem(storageKey(shopSlug), JSON.stringify(items.slice(0, MAX_ITEMS)));
    } catch {
        /* ignore */
    }
    emitChange();
}

export function getNotifications(shopSlug: string): CustomerNotificationItem[] {
    return loadRaw(shopSlug)
        .filter((n) => n && typeof n.id === 'string')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function unreadCount(shopSlug: string): number {
    return getNotifications(shopSlug).filter((n) => !n.read).length;
}

export function appendOrderNotification(
    shopSlug: string,
    partial: Omit<CustomerNotificationItem, 'read'> & { read?: boolean }
) {
    const items = loadRaw(shopSlug);
    const next: CustomerNotificationItem = {
        ...partial,
        read: partial.read ?? false,
    };
    const withoutDup = items.filter((i) => i.id !== next.id);
    saveRaw(shopSlug, [next, ...withoutDup]);
}

export function mergeBudgetAlerts(
    shopSlug: string,
    alerts: { type: string; message: string; severity: string }[],
    month: number,
    year: number
) {
    const items = loadRaw(shopSlug);
    const budgetKeys = new Set(
        alerts.map((a) => `budget-${a.type}-${month}-${year}`)
    );
    const withoutStaleBudget = items.filter((i) => {
        if (i.kind !== 'budget') return true;
        if (!i.budgetKey) return false;
        return budgetKeys.has(i.budgetKey);
    });

    if (!alerts.length) {
        if (withoutStaleBudget.length !== items.length) saveRaw(shopSlug, withoutStaleBudget);
        return;
    }

    const existingKeys = new Set(withoutStaleBudget.map((i) => i.budgetKey).filter(Boolean) as string[]);

    const toAdd: CustomerNotificationItem[] = [];
    for (const a of alerts) {
        const budgetKey = `budget-${a.type}-${month}-${year}`;
        if (existingKeys.has(budgetKey)) continue;
        toAdd.push({
            id: `notif-${budgetKey}`,
            kind: 'budget',
            title: a.severity === 'danger' ? 'Budget alert' : a.severity === 'warning' ? 'Budget reminder' : 'Budget',
            body: a.message,
            createdAt: new Date().toISOString(),
            read: false,
            budgetKey,
        });
    }
    if (toAdd.length) {
        saveRaw(shopSlug, [...toAdd, ...withoutStaleBudget]);
    } else if (withoutStaleBudget.length !== items.length) {
        saveRaw(shopSlug, withoutStaleBudget);
    }
}

export function markAllRead(shopSlug: string) {
    const items = loadRaw(shopSlug).map((i) => ({ ...i, read: true }));
    saveRaw(shopSlug, items);
}

export function markRead(shopSlug: string, id: string) {
    const items = loadRaw(shopSlug).map((i) => (i.id === id ? { ...i, read: true } : i));
    saveRaw(shopSlug, items);
}

export function clearAll(shopSlug: string) {
    saveRaw(shopSlug, []);
}

/** Map server SSE / PG payload to inbox lines (labels aligned with OrderDetail). */
export function formatOrderEventMessage(payload: Record<string, unknown>): { title: string; body: string } {
    const source = String(payload.source || '');
    const status = payload.status != null ? String(payload.status) : '';
    const deliveryStatus = payload.deliveryStatus != null ? String(payload.deliveryStatus) : '';
    const orderNumber = payload.orderNumber != null ? String(payload.orderNumber) : '';

    const statusLabels: Record<string, string> = {
        Pending: 'Order placed',
        Confirmed: 'Confirmed by shop',
        Packed: 'Packed and ready',
        OutForDelivery: 'Out for delivery',
        Delivered: 'Delivered',
        Cancelled: 'Cancelled',
    };

    const deliveryLabels: Record<string, string> = {
        ASSIGNED: 'Rider assigned',
        PICKED: 'Picked up',
        ON_THE_WAY: 'On the way',
        DELIVERED: 'Delivered',
    };

    // INSERT notify (`new_mobile_order`) has no `source` in payload
    if (!source && orderNumber) {
        return {
            title: 'Order received',
            body: `Order #${orderNumber} was submitted.`,
        };
    }
    if (!source && !orderNumber && status === 'Pending') {
        return {
            title: 'Order received',
            body: 'Your order was submitted.',
        };
    }

    if (source === 'mobile_order' && status === 'Pending') {
        return {
            title: 'Order received',
            body: orderNumber ? `Order #${orderNumber} was submitted.` : 'Your order was submitted.',
        };
    }

    if (deliveryStatus && source.startsWith('delivery')) {
        const label = deliveryLabels[deliveryStatus.toUpperCase()] || deliveryStatus.replace(/_/g, ' ');
        return {
            title: 'Delivery update',
            body: label,
        };
    }

    if (status) {
        return {
            title: 'Order status',
            body: statusLabels[status] || status,
        };
    }

    return {
        title: 'Order update',
        body: 'Your order was updated.',
    };
}

export function makeOrderNotificationId(payload: Record<string, unknown>, channel: string) {
    const oid = String(payload.orderId || '');
    const st = String(payload.status || '');
    const ds = String(payload.deliveryStatus || '');
    const src = String(payload.source || '');
    return `ord-${oid}-${channel}-${src}-${st}-${ds}-${Date.now()}`;
}
