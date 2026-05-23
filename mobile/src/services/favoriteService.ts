import { favoritesApi } from '../api';
import { favoriteStore } from '../stores/favoriteStore';
import { getFavoriteIds } from '../features/search/favoritesStorage';

const syncInflight = new Map<string, Promise<void>>();

/** Light haptic on native when available. */
function hapticLight() {
    try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(12);
        }
    } catch {
        /* */
    }
}

/**
 * Sync favorites from server and merge any guest-local IDs (upload then refresh).
 * Safe to call multiple times; dedupes in-flight per shop.
 */
export async function syncFavoritesFromServer(shopSlug: string): Promise<void> {
    const existing = syncInflight.get(shopSlug);
    if (existing) return existing;

    const job = (async () => {
        const localBefore = getFavoriteIds(shopSlug);
        const { productIds: serverIds } = await favoritesApi.getFavoriteIds(shopSlug);
        const serverSet = new Set(serverIds.map(String));

        const toUpload = [...localBefore].filter((id) => !serverSet.has(id));
        for (const productId of toUpload) {
            try {
                await favoritesApi.addFavorite(shopSlug, productId);
                serverSet.add(productId);
            } catch {
                /* skip invalid / removed products */
            }
        }

        favoriteStore.setIds(shopSlug, serverSet);
    })().finally(() => {
        syncInflight.delete(shopSlug);
    });

    syncInflight.set(shopSlug, job);
    return job;
}

export async function addFavorite(shopSlug: string, productId: string, isLoggedIn: boolean): Promise<void> {
    favoriteStore.applyToggle(shopSlug, productId, true);
    hapticLight();
    if (!isLoggedIn) return;
    try {
        await favoritesApi.addFavorite(shopSlug, productId);
    } catch (err) {
        favoriteStore.applyToggle(shopSlug, productId, false);
        throw err;
    }
}

export async function removeFavorite(shopSlug: string, productId: string, isLoggedIn: boolean): Promise<void> {
    favoriteStore.applyToggle(shopSlug, productId, false);
    if (!isLoggedIn) return;
    try {
        await favoritesApi.removeFavorite(shopSlug, productId);
    } catch (err) {
        favoriteStore.applyToggle(shopSlug, productId, true);
        throw err;
    }
}

export async function toggleFavorite(
    shopSlug: string,
    productId: string,
    isLoggedIn: boolean
): Promise<boolean> {
    const wasOn = favoriteStore.getIds(shopSlug).has(productId);
    if (wasOn) {
        await removeFavorite(shopSlug, productId, isLoggedIn);
        return false;
    }
    await addFavorite(shopSlug, productId, isLoggedIn);
    return true;
}
