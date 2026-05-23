import { getFavoriteIds, setFavoriteIds } from '../features/search/favoritesStorage';

type Listener = () => void;

/** In-memory favorite ID cache per shop (synced with localStorage + server). */
const idsByShop = new Map<string, Set<string>>();
const listenersByShop = new Map<string, Set<Listener>>();

function ensureSet(shopSlug: string): Set<string> {
    let cur = idsByShop.get(shopSlug);
    if (!cur) {
        cur = getFavoriteIds(shopSlug);
        idsByShop.set(shopSlug, cur);
    }
    return cur;
}

function notify(shopSlug: string) {
    const subs = listenersByShop.get(shopSlug);
    if (!subs) return;
    subs.forEach((fn) => fn());
}

export const favoriteStore = {
    getIds(shopSlug: string): Set<string> {
        return new Set(ensureSet(shopSlug));
    },

    setIds(shopSlug: string, ids: Iterable<string>) {
        const next = new Set(ids);
        idsByShop.set(shopSlug, next);
        setFavoriteIds(shopSlug, next);
        notify(shopSlug);
    },

    /** Optimistic toggle; returns the new favorited state. */
    applyToggle(shopSlug: string, productId: string, favorited: boolean): boolean {
        const cur = new Set(ensureSet(shopSlug));
        if (favorited) cur.add(productId);
        else cur.delete(productId);
        idsByShop.set(shopSlug, cur);
        setFavoriteIds(shopSlug, cur);
        notify(shopSlug);
        return favorited;
    },

    clearShop(shopSlug: string) {
        idsByShop.delete(shopSlug);
        setFavoriteIds(shopSlug, new Set());
        notify(shopSlug);
    },

    subscribe(shopSlug: string, listener: Listener): () => void {
        if (!listenersByShop.has(shopSlug)) listenersByShop.set(shopSlug, new Set());
        listenersByShop.get(shopSlug)!.add(listener);
        return () => listenersByShop.get(shopSlug)?.delete(listener);
    },
};
