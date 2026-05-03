import { menuPlannerApi } from '../api';

export type PendingMenuPlannerOp = {
    localId: string;
    shopSlug: string;
    kind: string;
    payload: Record<string, unknown>;
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    error?: string;
};

const DB_NAME = 'myshop_menu_planner_sync';
const STORE = 'pending_ops';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not available'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'localId' });
            }
        };
    });
}

function newLocalId() {
    return `mp-local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueMenuPlannerOp(
    shopSlug: string,
    kind: string,
    payload: Record<string, unknown>
): Promise<string> {
    const db = await openDb();
    const localId = newLocalId();
    const item: PendingMenuPlannerOp = {
        localId,
        shopSlug,
        kind,
        payload,
        createdAt: new Date().toISOString(),
        status: 'pending',
    };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(item);
        tx.oncomplete = () => {
            db.close();
            resolve(localId);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function getPendingMenuPlannerOps(): Promise<PendingMenuPlannerOp[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
            db.close();
            const list = (req.result as PendingMenuPlannerOp[]).filter(
                (x) => x.status === 'pending' || x.status === 'failed'
            );
            resolve(list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

async function removeOp(localId: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(localId);
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

async function applyOne(op: PendingMenuPlannerOp): Promise<void> {
    const { shopSlug, kind, payload } = op;
    switch (kind) {
        case 'add_menu_item':
            await menuPlannerApi.addMenuItem(shopSlug, String(payload.menuId), payload.body as Record<string, unknown>);
            break;
        case 'update_menu_item':
            await menuPlannerApi.updateMenuItem(shopSlug, String(payload.itemId), payload.body as Record<string, unknown>);
            break;
        case 'delete_menu_item':
            await menuPlannerApi.deleteMenuItem(shopSlug, String(payload.itemId));
            break;
        case 'move_menu_item':
            await menuPlannerApi.moveMenuItem(shopSlug, String(payload.itemId), payload.body as Record<string, unknown>);
            break;
        case 'generate_shopping_list':
            await menuPlannerApi.generateShoppingList(shopSlug, String(payload.menuId));
            break;
        case 'patch_shopping_item':
            await menuPlannerApi.patchShoppingItem(
                shopSlug,
                String(payload.listId),
                String(payload.itemId),
                payload.body as { is_checked?: boolean; is_at_home?: boolean }
            );
            break;
        default:
            throw new Error(`Unknown menu planner op: ${kind}`);
    }
}

/**
 * Process queued mutations (FIFO). Safe to call on `online` from App shell.
 */
export async function processMenuPlannerQueue(): Promise<{ succeeded: number; failed: number }> {
    const ops = await getPendingMenuPlannerOps();
    let succeeded = 0;
    let failed = 0;
    for (const op of ops) {
        try {
            await applyOne(op);
            await removeOp(op.localId);
            succeeded += 1;
        } catch (e: any) {
            failed += 1;
            console.warn('menu planner sync failed', e?.message || e);
        }
    }
    return { succeeded, failed };
}
