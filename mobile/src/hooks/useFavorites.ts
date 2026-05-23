import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useApp } from '../context/AppContext';
import { favoriteStore } from '../stores/favoriteStore';
import { syncFavoritesFromServer, toggleFavorite as toggleFavoriteService } from '../services/favoriteService';

const EMPTY_FAVORITES = new Set<string>();

function subscribeIds(shopSlug: string, onStoreChange: () => void) {
    return favoriteStore.subscribe(shopSlug, onStoreChange);
}

function getSnapshot(shopSlug: string) {
    return favoriteStore.getIds(shopSlug);
}

/**
 * Cached favorite product IDs with optimistic toggles and server sync when logged in.
 */
export function useFavorites(shopSlug: string | undefined) {
    const { state, showToast } = useApp();
    const slug = shopSlug ?? '';
    const favoriteIds = useSyncExternalStore(
        (onStoreChange) => (slug ? subscribeIds(slug, onStoreChange) : () => {}),
        () => (slug ? getSnapshot(slug) : EMPTY_FAVORITES),
        () => EMPTY_FAVORITES
    );
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        if (!slug || !state.isLoggedIn) return;
        let cancelled = false;
        setSyncing(true);
        syncFavoritesFromServer(slug)
            .catch(() => {
                /* offline — keep local cache */
            })
            .finally(() => {
                if (!cancelled) setSyncing(false);
            });
        return () => {
            cancelled = true;
        };
    }, [slug, state.isLoggedIn, state.customerId]);

    const isFavorite = useCallback((productId: string) => favoriteIds.has(productId), [favoriteIds]);

    const toggleFavorite = useCallback(
        async (productId: string) => {
            if (!slug) return;
            try {
                await toggleFavoriteService(slug, productId, state.isLoggedIn);
                if (!state.isLoggedIn) {
                    showToast('Saved on this device — sign in to sync across devices');
                }
            } catch (e: unknown) {
                showToast(e instanceof Error ? e.message : 'Could not update favorite');
            }
        },
        [slug, state.isLoggedIn, showToast]
    );

    return { favoriteIds, isFavorite, toggleFavorite, syncing };
}
