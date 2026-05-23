import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import FilterPanel from '../components/FilterPanel';
import ProductListCard, { type ProductListProduct } from '../components/ProductListCard';
import VirtualizedProductGrid from '../components/VirtualizedProductGrid';
import { useOnline } from '../hooks/useOnline';
import { getProducts as getCachedProducts, getCategories as getCachedCategories, getBrands as getCachedBrands } from '../services/offlineCache';
import { filterCategoriesWithListedProducts, countListedProductsByCategoryId } from '../utils/catalogCategories';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';
import GlobalSearchBar from '../features/search/GlobalSearchBar';
import { SearchSuggestionsPanel, type SuggestionPick } from '../features/search/SearchSuggestionsPanel';
import { addRecentSearch, getRecentSearches } from '../features/search/recentSearchesStorage';
import { getSearchSessionId } from '../features/search/searchSession';
import { useFavorites } from '../hooks/useFavorites';
import { favoritesApi } from '../api';

const LIST_LIMIT = 12;
const DEFAULT_LOW_PRICE_MAX = '500';

export default function Products() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dispatch, showToast, state } = useApp();
    const online = useOnline();

    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [brands, setBrands] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [offlineCatalogMissing, setOfflineCatalogMissing] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [categorySheetOpen, setCategorySheetOpen] = useState(false);
    const { favoriteIds, isFavorite, toggleFavorite } = useFavorites(shopSlug);

    const searchPageRef = useRef(1);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    const productsScrollRef = useRef<HTMLDivElement>(null);
    const [productsScrollEl, setProductsScrollEl] = useState<HTMLDivElement | null>(null);
    /** Next page for API when showUnavailable=true (server returns nextPage). */
    const nextUnavailablePageRef = useRef<number | null>(1);

    const showUnavailable = searchParams.get('showUnavailable') === 'true';
    const browse = searchParams.get('browse');
    const sortFromUrl = searchParams.get('sortBy');

    const filters = {
        categoryIds: searchParams.getAll('categoryIds[]').length > 0
            ? searchParams.getAll('categoryIds[]')
            : searchParams.get('category')
                ? [searchParams.get('category') as string]
                : [],
        subcategoryIds: searchParams.getAll('subcategoryIds[]'),
        brandIds: searchParams.getAll('brandIds[]'),
        minPrice: searchParams.get('minPrice'),
        maxPrice: searchParams.get('maxPrice'),
        availability: searchParams.get('availability'),
        onSale: searchParams.get('onSale') === 'true',
        sortBy: searchParams.get('sortBy') || 'newest',
        search: searchParams.get('search') || '',
        filterInStock: searchParams.get('filterInStock') === 'true',
        filterPopular: searchParams.get('filterPopular') === 'true',
        filterLowPrice: searchParams.get('filterLowPrice') === 'true',
        lowPriceMax: searchParams.get('lowPriceMax') || DEFAULT_LOW_PRICE_MAX,
        filterDeals: searchParams.get('filterDeals') === 'true' || searchParams.get('onSale') === 'true',
        filterMyFav: searchParams.get('filterMyFav') === 'true',
    };

    /** Explicit `sortBy` in the URL wins; with an active text search default to relevance when unset. */
    const effectiveSortBy = useMemo(() => {
        if (sortFromUrl) return sortFromUrl;
        const hasSearch = Boolean((searchParams.get('search') || '').trim());
        if (hasSearch && !browse) return 'relevance';
        if (browse === 'popular') return 'popularity';
        if (browse === 'new') return 'newest';
        return 'newest';
    }, [sortFromUrl, browse, searchParams]);

    useEffect(() => {
        searchPageRef.current = 1;
    }, [shopSlug, browse, showUnavailable, JSON.stringify(filters), effectiveSortBy]);

    const qUrl = searchParams.get('search') || '';
    useEffect(() => {
        setSearchTerm(qUrl);
    }, [qUrl]);

    // Legacy: "Low price" used to be a max-price filter; migrate old links to price sort.
    useEffect(() => {
        if (searchParams.get('filterLowPrice') !== 'true') return;
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('filterLowPrice');
                next.delete('lowPriceMax');
                if (!next.get('sortBy')) next.set('sortBy', 'price_low_high');
                return next;
            },
            { replace: true }
        );
    }, [searchParams, setSearchParams]);

    const loadProducts = useCallback(
        async (reset = false) => {
            if (!shopSlug) return;

            if (filters.filterMyFav && !state.isLoggedIn) {
                if (reset) {
                    setProducts([]);
                    setLoading(false);
                    setHasMore(false);
                    setCursor(null);
                }
                return;
            }

            if (reset) {
                setLoading(true);
                setCursor(null);
                nextUnavailablePageRef.current = 1;
            } else {
                setLoadingMore(true);
            }
            setOfflineCatalogMissing(false);

            const params: Record<string, any> = {
                limit: String(LIST_LIMIT),
                categoryIds: filters.categoryIds,
                subcategoryIds: filters.subcategoryIds,
                brandIds: filters.brandIds,
                minPrice: filters.minPrice,
                maxPrice: filters.maxPrice,
                availability: filters.availability || undefined,
                sortBy: effectiveSortBy,
                search: searchTerm,
                showUnavailable: showUnavailable ? 'true' : undefined,
                filterInStock: filters.filterInStock ? 'true' : undefined,
                filterPopular: filters.filterPopular ? 'true' : undefined,
                filterLowPrice: filters.filterLowPrice ? 'true' : undefined,
                lowPriceMax: filters.filterLowPrice ? filters.lowPriceMax : undefined,
                onSale: filters.filterDeals ? 'true' : undefined,
            };

            if (showUnavailable) {
                const pageToRequest = reset ? 1 : nextUnavailablePageRef.current ?? 1;
                params.page = String(pageToRequest);
            } else if (searchTerm.trim() && online) {
                if (reset) searchPageRef.current = 1;
                params.page = String(searchPageRef.current);
            } else if (!reset && cursor) {
                params.cursor = cursor;
            }

            try {
                const fetchProducts = filters.filterMyFav && state.isLoggedIn
                    ? favoritesApi.getFavoriteProducts(shopSlug, params)
                    : publicApi.getProducts(shopSlug, params);
                const data = await fetchProducts;
                const items = data.items ?? [];
                if (reset) {
                    setProducts(items);
                } else {
                    setProducts((prev) => [...prev, ...items]);
                }
                setCursor(data.nextCursor ?? null);
                setHasMore(Boolean(data.hasMore));
                if (showUnavailable) {
                    nextUnavailablePageRef.current =
                        data.nextPage !== undefined && data.nextPage !== null
                            ? data.nextPage
                            : null;
                } else if (searchTerm.trim() && online && data.nextPage != null) {
                    searchPageRef.current = data.nextPage;
                }
                if (online && reset && searchTerm.trim() && items.length === 0) {
                    void publicApi.postSearchAnalytics(shopSlug, {
                        eventType: 'no_results',
                        keyword: searchTerm.trim(),
                        sessionId: getSearchSessionId(),
                    });
                }
            } catch (err: any) {
                if (!online) {
                    const cached = await getCachedProducts(shopSlug);
                    if (cached?.items?.length) {
                        setProducts(cached.items);
                        setCursor(null);
                        setHasMore(false);
                    } else {
                        setOfflineCatalogMissing(true);
                    }
                } else {
                    showToast(err.message || 'Failed to load products');
                }
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [
            shopSlug,
            filters.categoryIds,
            filters.subcategoryIds,
            filters.brandIds,
            filters.minPrice,
            filters.maxPrice,
            filters.availability,
            filters.filterInStock,
            filters.filterPopular,
            filters.filterLowPrice,
            filters.lowPriceMax,
            filters.filterDeals,
            filters.filterMyFav,
            effectiveSortBy,
            searchTerm,
            showUnavailable,
            cursor,
            online,
            showToast,
            state.isLoggedIn,
        ]
    );

    useEffect(() => {
        if (!shopSlug) return;
        if (online) {
            publicApi
                .getCategories(shopSlug)
                .then((cats) => {
                    setCategories(Array.isArray(cats) ? cats : (cats as any)?.categories ?? []);
                })
                .catch(() => {});
            publicApi
                .getBrands(shopSlug)
                .then((bnds) => {
                    setBrands(Array.isArray(bnds) ? bnds : (bnds as any)?.brands ?? []);
                })
                .catch(() => {});
        } else {
            Promise.all([getCachedCategories(shopSlug), getCachedBrands(shopSlug)]).then(([cCat, cBrand]) => {
                setCategories(cCat?.items ?? []);
                setBrands(cBrand?.items ?? []);
            });
        }
    }, [shopSlug, online]);

    const mainCategories = useMemo(
        () => categories.filter((c: any) => !c.parent_id),
        [categories]
    );

    const categoryCountsOffline = useMemo(
        () => (online ? null : countListedProductsByCategoryId(products)),
        [online, products]
    );

    const mainCategoriesForRail = useMemo(
        () => filterCategoriesWithListedProducts(mainCategories, categoryCountsOffline),
        [mainCategories, categoryCountsOffline]
    );

    useEffect(() => {
        if (!shopSlug) return;
        setCursor(null);
        if (!online) {
            setLoading(true);
            setOfflineCatalogMissing(false);
            getCachedProducts(shopSlug)
                .then((cached) => {
                    if (cached?.items?.length) {
                        setProducts(cached.items);
                    } else {
                        setOfflineCatalogMissing(true);
                    }
                    setHasMore(false);
                    setLoading(false);
                })
                .catch(() => {
                    setOfflineCatalogMissing(true);
                    setLoading(false);
                });
        }
    }, [shopSlug, online]);

    useEffect(() => {
        if (online && shopSlug) {
            loadProducts(true);
        }
        // Intentionally omit loadProducts: it depends on cursor; including it would refetch after every page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online, shopSlug, JSON.stringify(filters), effectiveSortBy, browse, showUnavailable]);

    const selectedCategoryIdFromUrl = useMemo(() => {
        if (searchParams.getAll('categoryIds[]').length > 0) {
            return searchParams.getAll('categoryIds[]')[0] || null;
        }
        return searchParams.get('category') || null;
    }, [searchParams]);

    /** Drop category from URL if it has no listable products (e.g. deep link to an empty category). */
    useEffect(() => {
        if (!shopSlug) return;
        const id = selectedCategoryIdFromUrl;
        if (!id) return;
        const cat = categories.find((c: any) => c.id === id);
        if (!cat) return;
        let isEmpty = false;
        if (cat.product_count != null && String(cat.product_count) !== '') {
            isEmpty = Number(cat.product_count) <= 0;
        } else if (!online) {
            isEmpty = (categoryCountsOffline?.get(String(id)) ?? 0) <= 0;
        } else {
            return;
        }
        if (isEmpty) {
            setSearchParams((prev) => {
                prev.delete('category');
                prev.delete('categoryIds[]');
                return prev;
            });
        }
    }, [shopSlug, categories, selectedCategoryIdFromUrl, online, categoryCountsOffline, setSearchParams]);

    const displayedProducts = useMemo(() => {
        if (online) {
            if (filters.filterMyFav && !state.isLoggedIn) return [];
            if (filters.filterMyFav) {
                return products.filter((p: any) => favoriteIds.has(String(p.id)));
            }
            return products;
        }
        let list = [...products].filter((p: any) => isMobileCatalogPriceListed(p));
        if (filters.filterMyFav) {
            list = list.filter((p: any) => favoriteIds.has(String(p.id)));
        }
        if (!showUnavailable) {
            list = list.filter(
                (p: any) => (Number(p.stock ?? p.available_stock) > 0 || p.is_pre_order)
            );
        } else {
            list = [...list].sort((a: any, b: any) => {
                const sa = Number(a.stock ?? a.available_stock) > 0 || a.is_pre_order ? 0 : 1;
                const sb = Number(b.stock ?? b.available_stock) > 0 || b.is_pre_order ? 0 : 1;
                return sa - sb;
            });
        }
        if (searchTerm.trim()) {
            const t = searchTerm.trim().toLowerCase();
            list = list.filter(
                (p: any) =>
                    (p.name && p.name.toLowerCase().includes(t)) ||
                    (p.sku && p.sku.toLowerCase().includes(t))
            );
        }
        if (filters.categoryIds?.length) {
            const s = new Set(filters.categoryIds);
            list = list.filter((p: any) => p.category_id && s.has(String(p.category_id)));
        }
        if (filters.subcategoryIds?.length) {
            const s = new Set(filters.subcategoryIds);
            list = list.filter((p: any) => p.subcategory_id && s.has(String(p.subcategory_id)));
        }
        if (filters.brandIds?.length) {
            const idSet = new Set(filters.brandIds.map(String));
            list = list.filter((p: any) => {
                if (p.brand_id && idSet.has(String(p.brand_id))) return true;
                const label = (p.brand || p.brand_name || '').toString().trim();
                if (!label) return false;
                const low = label.toLowerCase();
                return brands.some(
                    (b: any) => idSet.has(String(b.id)) && b.name && b.name.toLowerCase().trim() === low
                );
            });
        }
        if (filters.minPrice) {
            const min = parseFloat(filters.minPrice);
            if (!isNaN(min)) list = list.filter((p: any) => Number(p.price) >= min);
        }
        if (filters.maxPrice) {
            const max = parseFloat(filters.maxPrice);
            if (!isNaN(max)) list = list.filter((p: any) => Number(p.price) <= max);
        }
        if (filters.filterDeals) list = list.filter((p: any) => p.is_on_sale);
        if (filters.filterInStock) {
            list = list.filter((p: any) => Number(p.stock ?? p.available_stock) > 0);
        }
        if (filters.availability === 'out_of_stock') {
            list = list.filter(
                (p: any) => Number(p.stock ?? p.available_stock) <= 0 && !p.is_pre_order
            );
        } else if (filters.availability === 'pre_order') {
            list = list.filter((p: any) => p.is_pre_order);
        }
        if (filters.filterPopular) {
            list = list.filter(
                (p: any) => (p.popularity_score ?? 0) > 0 || (p.total_sales ?? 0) > 0
            );
        }
        const sortBy = effectiveSortBy || 'newest';
        if (sortBy === 'price_low_high') list.sort((a: any, b: any) => Number(a.price) - Number(b.price));
        else if (sortBy === 'price_high_low') list.sort((a: any, b: any) => Number(b.price) - Number(a.price));
        else if (sortBy === 'popularity') {
            list.sort(
                (a: any, b: any) =>
                    (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0)
            );
        } else if (sortBy === 'a_z') list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        else if (sortBy === 'z_a') list.sort((a: any, b: any) => (b.name || '').localeCompare(a.name || ''));
        else if (sortBy === 'best_selling') {
            list.sort((a: any, b: any) => (Number(b.total_sales) || 0) - (Number(a.total_sales) || 0));
        }         else if (sortBy === 'top_rated') {
            list.sort((a: any, b: any) => {
                const ra = (Number(b.rating_avg) || 0) - (Number(a.rating_avg) || 0);
                if (ra !== 0) return ra;
                return (Number(b.rating_count) || 0) - (Number(a.rating_count) || 0);
            });
        } else if (sortBy === 'biggest_discount') {
            list.sort(
                (a: any, b: any) =>
                    (Number(b.discount_percentage) || 0) - (Number(a.discount_percentage) || 0)
            );
        } else if (sortBy === 'fastest_delivery') {
            list.sort(
                (a: any, b: any) =>
                    (Number(b.stock ?? b.available_stock) || 0) -
                    (Number(a.stock ?? a.available_stock) || 0)
            );
        } else if (sortBy === 'relevance' && searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            list.sort((a: any, b: any) => {
                const an = (a.name || '').toLowerCase();
                const bn = (b.name || '').toLowerCase();
                const ae = an === q ? 1 : 0;
                const be = bn === q ? 1 : 0;
                if (be !== ae) return be - ae;
                const as = Number(a.stock ?? a.available_stock) > 0 || a.is_pre_order ? 1 : 0;
                const bs = Number(b.stock ?? b.available_stock) > 0 || b.is_pre_order ? 1 : 0;
                if (bs !== as) return bs - as;
                return (Number(b.total_sales) || 0) - (Number(a.total_sales) || 0);
            });
        } else {
            list.sort((a: any, b: any) => {
                const ta = new Date(a.created_at).getTime();
                const tb = new Date(b.created_at).getTime();
                return tb - ta;
            });
        }
        return list;
    }, [online, products, searchTerm, filters, effectiveSortBy, showUnavailable, brands, favoriteIds, state.isLoggedIn]);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    useEffect(() => {
        if (!hasMore || loadingMore || loading) return;
        const el = loadMoreSentinelRef.current;
        const root = productsScrollEl;
        if (!el || !root) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
                    loadProducts(false);
                }
            },
            { root, rootMargin: '240px', threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadProducts, productsScrollEl]);

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setSearchParams((prev) => {
                if (val) prev.set('search', val);
                else prev.delete('search');
                return prev;
            });
        }, 250);
    };

    const commitSearchFromBar = () => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        const q = searchTerm.trim();
        setSearchParams((prev) => {
            if (q) prev.set('search', q);
            else prev.delete('search');
            return prev;
        });
        if (shopSlug && q) {
            addRecentSearch(shopSlug, q);
            void publicApi.postSearchAnalytics(shopSlug, {
                eventType: 'keyword_search',
                keyword: q,
                sessionId: getSearchSessionId(),
            });
        }
    };

    const onSearchPick = useCallback(
        (pick: SuggestionPick) => {
            if (!shopSlug) return;
            setSearchFocused(false);
            if (pick.kind === 'product') {
                navigate(`/${shopSlug}/products/${pick.id}`, { state: { from: location.pathname } });
                void publicApi.postSearchAnalytics(shopSlug, {
                    eventType: 'product_click',
                    productId: pick.id,
                    keyword: searchTerm.trim() || undefined,
                    sessionId: getSearchSessionId(),
                });
                return;
            }
            if (pick.kind === 'brand') {
                setSearchParams((prev) => {
                    prev.delete('brandIds[]');
                    prev.append('brandIds[]', pick.id);
                    prev.delete('search');
                    prev.delete('category');
                    prev.delete('categoryIds[]');
                    return prev;
                });
                setSearchTerm('');
                return;
            }
            if (pick.kind === 'category') {
                setSearchParams((prev) => {
                    prev.delete('categoryIds[]');
                    prev.delete('category');
                    prev.set('category', pick.id);
                    prev.delete('search');
                    return prev;
                });
                setSearchTerm('');
                return;
            }
            const text = pick.label.trim();
            setSearchTerm(text);
            setSearchParams((prev) => {
                prev.set('search', text);
                return prev;
            });
            addRecentSearch(shopSlug, text);
        },
        [shopSlug, navigate, location.pathname, setSearchParams, searchTerm]
    );

    const applyFilters = (newFilters: Record<string, unknown>) => {
        setSearchParams((prev) => {
            const keysToDelete = [
                'categoryIds[]',
                'subcategoryIds[]',
                'brandIds[]',
                'category',
                'browse',
                'minPrice',
                'maxPrice',
                'sortBy',
                'availability',
                'onSale',
                'filterDeals',
                'filterInStock',
                'filterPopular',
                'filterLowPrice',
                'lowPriceMax',
                'filterMyFav',
            ];
            keysToDelete.forEach((k) => prev.delete(k));

            const entries = Object.entries(newFilters).filter(([k]) => k !== 'search');
            entries.forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    value.forEach((v) => prev.append(`${key}[]`, String(v)));
                } else if (value !== undefined && value !== null && value !== '') {
                    if (typeof value === 'boolean') {
                        if (value) prev.set(key, 'true');
                    } else {
                        prev.set(key, String(value));
                    }
                }
            });
            return prev;
        });
    };

    const clearFilters = () => {
        setSearchParams(new URLSearchParams());
        setSearchTerm('');
    };

    const removeFilter = (key: string, value?: string) => {
        setSearchParams((prev) => {
            if (value) {
                const current = prev.getAll(key).filter((v) => v !== value);
                prev.delete(key);
                current.forEach((v) => prev.append(key, v));
            } else {
                prev.delete(key);
            }
            return prev;
        });
    };

    const setChip = (key: string, active: boolean) => {
        setSearchParams((prev) => {
            if (active) prev.set(key, 'true');
            else prev.delete(key);
            return prev;
        });
    };

    const setBrowse = (mode: 'all' | 'popular' | 'new' | null, categoryId?: string) => {
        setSearchParams((prev) => {
            prev.delete('browse');
            prev.delete('category');
            prev.delete('categoryIds[]');
            if (categoryId) {
                prev.set('category', categoryId);
            } else if (mode === 'popular') prev.set('browse', 'popular');
            else if (mode === 'new') prev.set('browse', 'new');
            return prev;
        });
    };

    const toggleShowUnavailable = () => {
        setSearchParams((prev) => {
            if (prev.get('showUnavailable') === 'true') prev.delete('showUnavailable');
            else prev.set('showUnavailable', 'true');
            return prev;
        });
    };

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const cartQtyMap = useMemo(() => {
        const m = new Map<string, number>();
        state.cart.forEach((i) => m.set(i.productId, i.quantity));
        return m;
    }, [state.cart]);

    const addToCart = useCallback(
        (product: ProductListProduct, qtyDelta = 1) => {
            const stock = Number(product.stock ?? product.available_stock ?? 0);
            const existing = state.cart.find((i) => i.productId === product.id);
            const nextQty = (existing?.quantity ?? 0) + qtyDelta;
            if (!product.is_pre_order && stock > 0 && nextQty > stock) {
                showToast(`Only ${stock} available`);
                return;
            }
            if (qtyDelta > 0 && !product.is_pre_order && stock <= 0) {
                showToast('This product is unavailable');
                return;
            }
            try {
                if (existing) {
                    if (nextQty <= 0) {
                        dispatch({ type: 'REMOVE_FROM_CART', productId: product.id });
                        return;
                    }
                    dispatch({ type: 'UPDATE_QTY', productId: product.id, quantity: nextQty });
                } else if (qtyDelta > 0) {
                    dispatch({
                        type: 'ADD_TO_CART',
                        item: {
                            productId: product.id,
                            name: product.name,
                            sku: product.sku || '',
                            price: product.price,
                            quantity: 1,
                            image_url: getProductImagePath(product),
                            available_stock: stock,
                            tax_rate: parseFloat(String(product.tax_rate)) || 0,
                        },
                    });
                }
            } catch (e: any) {
                showToast(e?.message || 'Could not update cart');
            }
        },
        [dispatch, showToast, state.cart]
    );

    const handleAddOne = (product: ProductListProduct) => {
        addToCart(product, 1);
    };

    const handleChangeQty = (productId: string, quantity: number) => {
        const product = displayedProducts.find((p: any) => p.id === productId);
        if (!product) return;
        const cur = cartQtyMap.get(productId) ?? 0;
        const delta = quantity - cur;
        if (delta === 0) return;
        addToCart(product as ProductListProduct, delta);
    };

    const filterPanelFilters = {
        ...filters,
        sortBy: effectiveSortBy,
        onSale: filters.filterDeals,
    };

    const activeFilterCount = useMemo(() => {
        let n = 0;
        n += filters.categoryIds.length;
        n += filters.subcategoryIds.length;
        n += filters.brandIds.length;
        if (filters.minPrice || filters.maxPrice) n += 1;
        if (filters.filterDeals) n += 1;
        if (filters.filterInStock) n += 1;
        if (filters.filterPopular) n += 1;
        if (filters.filterMyFav) n += 1;
        if (filters.availability) n += 1;
        const sortIsDefault =
            effectiveSortBy === 'newest' ||
            (effectiveSortBy === 'relevance' && !sortFromUrl) ||
            (browse === 'popular' && effectiveSortBy === 'popularity') ||
            (browse === 'new' && effectiveSortBy === 'newest');
        if (!sortIsDefault && !browse) n += 1;
        return n;
    }, [filters, browse, searchParams, effectiveSortBy, sortFromUrl]);

    const sortChipLabel = (sort: string): string => {
        const map: Record<string, string> = {
            relevance: 'Relevance',
            price_low_high: 'Price ↑',
            price_high_low: 'Price ↓',
            newest: 'Newest',
            popularity: 'Popular',
            best_selling: 'Best selling',
            top_rated: 'Top rated',
            biggest_discount: 'Biggest discount',
            fastest_delivery: 'Fast delivery',
            a_z: 'A–Z',
            z_a: 'Z–A',
        };
        return map[sort] || sort;
    };

    const selectedCategoryId = filters.categoryIds[0] ?? null;
    const navSelected = (id: string) => {
        if (id === 'all') return !browse && !selectedCategoryId;
        if (id === 'popular')
            return (browse === 'popular' || filters.sortBy === 'popularity') && !selectedCategoryId;
        if (id === 'new') return browse === 'new' && !selectedCategoryId;
        return selectedCategoryId === id;
    };

    const emptyDiscovery = useQuery({
        queryKey: ['emptyDiscovery', shopSlug, searchTerm],
        queryFn: () =>
            publicApi.getSearchRecommendations(shopSlug!, {
                q: searchTerm.trim() || undefined,
                limit: 12,
            }),
        enabled: Boolean(
            online &&
                shopSlug &&
                !loading &&
                displayedProducts.length === 0 &&
                !offlineCatalogMissing &&
                !filters.filterMyFav
        ),
    });

    const disc = emptyDiscovery.data as
        | { similar?: any[]; recommended?: any[]; categories?: any[] }
        | undefined;

    const browseSearchBar = shopSlug ? (
        <div className="browse-search-fixed" role="search">
            <div className="browse-search-row">
                <button
                    type="button"
                    className={`browse-filter-trigger ${activeFilterCount > 0 ? 'active' : ''}`}
                    onClick={() => setIsFilterOpen(true)}
                    aria-expanded={isFilterOpen ? 'true' : 'false'}
                    aria-label="Open filters"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                    >
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="18" x2="14" y2="18" />
                    </svg>
                    <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                </button>
                <div className="browse-search-wrap">
                    <GlobalSearchBar
                        variant="browse"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onSubmit={commitSearchFromBar}
                        focused={searchFocused}
                        onFocusChange={setSearchFocused}
                        overlay={
                            <SearchSuggestionsPanel
                                shopSlug={shopSlug}
                                query={searchTerm}
                                open={searchFocused}
                                recent={getRecentSearches(shopSlug)}
                                onPick={onSearchPick}
                            />
                        }
                    />
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="page page--browse browse-layout fade-in">
            {browseSearchBar ? createPortal(browseSearchBar, document.body) : null}
            <div className="browse-search-spacer" aria-hidden />

            <div
                ref={(el) => {
                    productsScrollRef.current = el;
                    setProductsScrollEl(el);
                }}
                className="browse-products-scroll"
            >
                <div className="browse-filters-scroll">
                <div className="filter-chips-row" role="toolbar" aria-label="Quick filters">
                    <button
                        type="button"
                        className={`filter-chip-btn ${filters.filterInStock ? 'active' : ''}`}
                        onClick={() => setChip('filterInStock', !filters.filterInStock)}
                    >
                        In Stock
                    </button>
                    <button
                        type="button"
                        className={`filter-chip-btn ${filters.filterPopular ? 'active' : ''}`}
                        onClick={() => setChip('filterPopular', !filters.filterPopular)}
                    >
                        Popular
                    </button>
                    <button
                        type="button"
                        className={`filter-chip-btn ${sortFromUrl === 'price_low_high' ? 'active' : ''}`}
                        onClick={() => {
                            setSearchParams((prev) => {
                                if (prev.get('sortBy') === 'price_low_high') {
                                    prev.delete('sortBy');
                                } else {
                                    prev.set('sortBy', 'price_low_high');
                                    prev.delete('browse');
                                }
                                prev.delete('filterLowPrice');
                                prev.delete('lowPriceMax');
                                return prev;
                            });
                        }}
                    >
                        Low Price
                    </button>
                    <button
                        type="button"
                        className={`filter-chip-btn ${filters.filterDeals ? 'active' : ''}`}
                        onClick={() => setChip('filterDeals', !filters.filterDeals)}
                    >
                        Deals
                    </button>
                    <button
                        type="button"
                        className={`filter-chip-btn ${filters.filterMyFav ? 'active' : ''}`}
                        onClick={() => setChip('filterMyFav', !filters.filterMyFav)}
                        aria-pressed={filters.filterMyFav}
                    >
                        My Fav
                    </button>
                </div>

                <div className="category-nav-rail category-nav-rail--text">
                    <div className="category-nav-rail__scroll" role="tablist" aria-label="Categories">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={navSelected('all')}
                            className={`category-tab ${navSelected('all') ? 'selected' : ''}`}
                            onClick={() => setBrowse('all')}
                        >
                            All
                        </button>
                        {mainCategoriesForRail.map((c: any) => (
                            <button
                                key={c.id}
                                type="button"
                                role="tab"
                                aria-selected={navSelected(c.id)}
                                className={`category-tab ${navSelected(c.id) ? 'selected' : ''}`}
                                onClick={() => setBrowse(null, c.id)}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="category-nav-expand"
                        onClick={() => setCategorySheetOpen(true)}
                        aria-label="Show all categories"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                </div>

                <div className="browse-toolbar-row">
                    <button
                        type="button"
                        className={`toggle-unavailable ${showUnavailable ? 'active' : ''}`}
                        onClick={toggleShowUnavailable}
                    >
                        Show unavailable items
                    </button>
                </div>
                </div>

            {activeFilterCount > 0 && (
                <div className="active-filters">
                    {filters.categoryIds.map((id) => {
                        const cat = categories.find((c) => c.id === id);
                        return (
                            cat && (
                                <div key={id} className="filter-chip">
                                    {cat.name}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSearchParams((prev) => {
                                                prev.delete('category');
                                                prev.delete('categoryIds[]');
                                                const rest = prev.getAll('categoryIds[]').filter((x) => x !== id);
                                                prev.delete('categoryIds[]');
                                                rest.forEach((x) => prev.append('categoryIds[]', x));
                                                return prev;
                                            })
                                        }
                                    >
                                        ×
                                    </button>
                                </div>
                            )
                        );
                    })}
                    {filters.subcategoryIds.map((id: string) => {
                        const sub = categories.find((c) => c.id === id);
                        return (
                            sub && (
                                <div key={`sub-${id}`} className="filter-chip">
                                    {sub.name}
                                    <button type="button" onClick={() => removeFilter('subcategoryIds[]', id)}>
                                        ×
                                    </button>
                                </div>
                            )
                        );
                    })}
                    {filters.brandIds.map((id) => {
                        const brand = brands.find((b) => b.id === id);
                        return (
                            brand && (
                                <div key={id} className="filter-chip">
                                    {brand.name}
                                    <button type="button" onClick={() => removeFilter('brandIds[]', id)}>
                                        ×
                                    </button>
                                </div>
                            )
                        );
                    })}
                    {(filters.minPrice || filters.maxPrice) && (
                        <div className="filter-chip">
                            {filters.minPrice ? `≥ Rs.${filters.minPrice}` : ''}{' '}
                            {filters.maxPrice ? `≤ Rs.${filters.maxPrice}` : ''}
                            <button
                                type="button"
                                onClick={() => {
                                    removeFilter('minPrice');
                                    removeFilter('maxPrice');
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}
                    {filters.filterInStock && (
                        <div className="filter-chip">
                            In stock
                            <button type="button" onClick={() => removeFilter('filterInStock')}>
                                ×
                            </button>
                        </div>
                    )}
                    {filters.availability === 'out_of_stock' && (
                        <div className="filter-chip">
                            Out of stock
                            <button type="button" onClick={() => removeFilter('availability')}>
                                ×
                            </button>
                        </div>
                    )}
                    {filters.availability === 'pre_order' && (
                        <div className="filter-chip">
                            Pre-order
                            <button type="button" onClick={() => removeFilter('availability')}>
                                ×
                            </button>
                        </div>
                    )}
                    {filters.filterPopular && (
                        <div className="filter-chip">
                            Popular
                            <button type="button" onClick={() => removeFilter('filterPopular')}>
                                ×
                            </button>
                        </div>
                    )}
                    {filters.filterMyFav && (
                        <div className="filter-chip">
                            My Fav
                            <button type="button" onClick={() => removeFilter('filterMyFav')}>
                                ×
                            </button>
                        </div>
                    )}
                    {filters.filterDeals && (
                        <div className="filter-chip">
                            Deals
                            <button
                                type="button"
                                onClick={() => {
                                    removeFilter('onSale');
                                    removeFilter('filterDeals');
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}
                    {!browse && sortFromUrl && (
                        <div className="filter-chip">
                            {sortChipLabel(effectiveSortBy)}
                            <button type="button" onClick={() => removeFilter('sortBy')}>
                                ×
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        className="btn-sm"
                        style={{ color: 'var(--primary)', fontWeight: 700 }}
                        onClick={clearFilters}
                    >
                        Clear All
                    </button>
                </div>
            )}

            {loading ? (
                <div className="product-grid product-grid--browse">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="product-card product-card--list">
                            <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
                            <div style={{ padding: 8 }}>
                                <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 6 }} />
                                <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 6 }} />
                                <div className="skeleton" style={{ height: 36, width: '100%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : offlineCatalogMissing ? (
                <div className="empty-state">
                    <h3>Catalog not available offline</h3>
                    <p>Connect to load products for this shop.</p>
                </div>
            ) : displayedProducts.length === 0 ? (
                filters.filterMyFav ? (
                    <div className="empty-state empty-state--favorites">
                        <div className="empty-state__icon" aria-hidden>
                            ❤️
                        </div>
                        {!state.isLoggedIn ? (
                            <>
                                <h3>Sign in to see favorites</h3>
                                <p>Save products you love and access them on any device.</p>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => navigate(`/${shopSlug}/login`)}
                                >
                                    Sign in
                                </button>
                            </>
                        ) : (
                            <>
                                <h3>No Favorites Yet</h3>
                                <p>
                                    Save products you love for quick access anytime. Tap the heart on any product.
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setChip('filterMyFav', false)}
                                >
                                    Browse Products
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                <div className="empty-state empty-state--discovery">
                    <h3>We could not match that exactly</h3>
                    <p>Here are picks you might like instead — adjust filters or try a shorter keyword.</p>
                    <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={clearFilters}>
                        Clear filters
                    </button>
                    {emptyDiscovery.isFetching ? (
                        <p className="empty-state__loading" style={{ marginTop: 16 }}>
                            Loading suggestions…
                        </p>
                    ) : null}
                    {disc?.similar && disc.similar.length > 0 ? (
                        <section className="empty-discovery-section">
                            <h4>Close matches</h4>
                            <div className="product-grid product-grid--browse">
                                {disc.similar.slice(0, 6).map((p: any) => (
                                    <ProductListCard
                                        key={p.id}
                                        product={p}
                                        shopSlug={shopSlug!}
                                        cartQty={cartQtyMap.get(p.id) ?? 0}
                                        formatPrice={formatPrice}
                                        unavailableStyle={false}
                                        onAddOne={handleAddOne}
                                        onChangeQty={handleChangeQty}
                                        isFavorite={isFavorite(p.id)}
                                        onToggleFavorite={() => void toggleFavorite(p.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {disc?.recommended && disc.recommended.length > 0 ? (
                        <section className="empty-discovery-section">
                            <h4>Recommended for you</h4>
                            <div className="product-grid product-grid--browse">
                                {disc.recommended.slice(0, 6).map((p: any) => (
                                    <ProductListCard
                                        key={p.id}
                                        product={p}
                                        shopSlug={shopSlug!}
                                        cartQty={cartQtyMap.get(p.id) ?? 0}
                                        formatPrice={formatPrice}
                                        unavailableStyle={false}
                                        onAddOne={handleAddOne}
                                        onChangeQty={handleChangeQty}
                                        isFavorite={isFavorite(p.id)}
                                        onToggleFavorite={() => void toggleFavorite(p.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {disc?.categories && disc.categories.length > 0 ? (
                        <section className="empty-discovery-section">
                            <h4>Browse categories</h4>
                            <div className="empty-discovery-cats">
                                {disc.categories.map((c: any) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className="empty-discovery-cat-chip"
                                        onClick={() =>
                                            setSearchParams((prev) => {
                                                prev.set('category', c.id);
                                                prev.delete('search');
                                                return prev;
                                            })
                                        }
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
                )
            ) : (
                <>
                    <VirtualizedProductGrid
                        scrollElement={productsScrollEl}
                        items={displayedProducts}
                        renderCard={(p: any) => {
                            const qty = cartQtyMap.get(p.id) ?? 0;
                            const unavailable =
                                showUnavailable &&
                                Number(p.stock ?? p.available_stock) <= 0 &&
                                !p.is_pre_order;
                            return (
                                <ProductListCard
                                    product={p}
                                    shopSlug={shopSlug!}
                                    cartQty={qty}
                                    formatPrice={formatPrice}
                                    unavailableStyle={unavailable}
                                    density="compact"
                                    onAddOne={handleAddOne}
                                    onChangeQty={handleChangeQty}
                                    isFavorite={isFavorite(p.id)}
                                    onToggleFavorite={() => void toggleFavorite(p.id)}
                                />
                            );
                        }}
                    />
                    {hasMore && (
                        <div
                            ref={loadMoreSentinelRef}
                            style={{
                                minHeight: 40,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 16,
                            }}
                        >
                            {loadingMore && <span className="spinner" style={{ width: 24, height: 24 }} />}
                        </div>
                    )}
                </>
            )}

            </div>

            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                categories={categories}
                brands={brands}
                filters={filterPanelFilters}
                onApply={applyFilters}
                onClear={clearFilters}
            />

            {categorySheetOpen
                ? createPortal(
                      <div
                          className="bottom-sheet-overlay"
                          role="presentation"
                          onClick={() => setCategorySheetOpen(false)}
                      >
                          <div
                              className="bottom-sheet category-sheet"
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby="category-sheet-title"
                              onClick={(e) => e.stopPropagation()}
                          >
                              <div className="bottom-sheet-header">
                                  <h2 id="category-sheet-title">Categories</h2>
                                  <button
                                      type="button"
                                      className="filter-drawer-close"
                                      onClick={() => setCategorySheetOpen(false)}
                                      aria-label="Close categories"
                                  >
                                      ×
                                  </button>
                              </div>
                              <div className="category-sheet__list">
                                  <button
                                      type="button"
                                      className={`category-sheet__item ${navSelected('all') ? 'selected' : ''}`}
                                      onClick={() => {
                                          setBrowse('all');
                                          setCategorySheetOpen(false);
                                      }}
                                  >
                                      All
                                  </button>
                                  {mainCategoriesForRail.map((c: any) => (
                                      <button
                                          key={c.id}
                                          type="button"
                                          className={`category-sheet__item ${navSelected(c.id) ? 'selected' : ''}`}
                                          onClick={() => {
                                              setBrowse(null, c.id);
                                              setCategorySheetOpen(false);
                                          }}
                                      >
                                          {c.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
        </div>
    );
}
