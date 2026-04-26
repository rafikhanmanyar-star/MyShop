import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import FilterPanel from '../components/FilterPanel';
import ProductListCard, { type ProductListProduct } from '../components/ProductListCard';
import VirtualizedProductGrid from '../components/VirtualizedProductGrid';
import CategoryRailIcon from '../components/CategoryRailIcon';
import { useOnline } from '../hooks/useOnline';
import { getProducts as getCachedProducts, getCategories as getCachedCategories, getBrands as getCachedBrands } from '../services/offlineCache';
import { filterCategoriesWithListedProducts, countListedProductsByCategoryId } from '../utils/catalogCategories';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';

const LIST_LIMIT = 12;
const DEFAULT_LOW_PRICE_MAX = '500';

export default function Products() {
    const { shopSlug } = useParams();
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

    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
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
    };

    /** Explicit `sortBy` in the URL (e.g. low→high) wins over browse rail presets. */
    const effectiveSortBy = useMemo(() => {
        if (sortFromUrl) return sortFromUrl;
        if (browse === 'popular') return 'popularity';
        if (browse === 'new') return 'newest';
        return 'newest';
    }, [sortFromUrl, browse]);

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
            } else if (!reset && cursor) {
                params.cursor = cursor;
            }

            try {
                const data = await publicApi.getProducts(shopSlug, params);
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
            effectiveSortBy,
            searchTerm,
            showUnavailable,
            cursor,
            online,
            showToast,
        ]
    );

    useEffect(() => {
        if (!shopSlug) return;
        if (online) {
            Promise.all([publicApi.getCategories(shopSlug), publicApi.getBrands(shopSlug)])
                .then(([cats, bnds]) => {
                    setCategories(Array.isArray(cats) ? cats : (cats as any)?.categories ?? []);
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
        if (online) return products;
        let list = [...products].filter((p: any) => isMobileCatalogPriceListed(p));
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
        } else {
            list.sort((a: any, b: any) => {
                const ta = new Date(a.created_at).getTime();
                const tb = new Date(b.created_at).getTime();
                return tb - ta;
            });
        }
        return list;
    }, [online, products, searchTerm, filters, effectiveSortBy, showUnavailable, brands]);

    useEffect(() => {
        if (!hasMore || loadingMore || loading) return;
        const el = loadMoreSentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
                    loadProducts(false);
                }
            },
            { rootMargin: '240px', threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadProducts]);

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setSearchParams((prev) => {
                if (val) prev.set('search', val);
                else prev.delete('search');
                return prev;
            });
        }, 300);
    };

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
        if (filters.availability) n += 1;
        const sortIsDefault = filters.sortBy === 'newest' || !searchParams.get('sortBy');
        if (!sortIsDefault && !browse) n += 1;
        return n;
    }, [filters, browse, searchParams]);

    const sortChipLabel = (sort: string): string => {
        const map: Record<string, string> = {
            price_low_high: 'Price ↑',
            price_high_low: 'Price ↓',
            newest: 'Newest',
            popularity: 'Popular',
            best_selling: 'Best selling',
            top_rated: 'Top rated',
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

    return (
        <div className="page page--browse fade-in">
            <div className="browse-sticky">
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
                    <div className="search-bar search-bar--browse">
                        <svg
                            className="search-icon"
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                            type="search"
                            placeholder="Search products..."
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                </div>

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
                </div>

                <div className="category-nav-rail" role="tablist" aria-label="Categories">
                    <button
                        type="button"
                        role="tab"
                        className={`category-nav-item ${navSelected('all') ? 'selected' : ''}`}
                        onClick={() => setBrowse('all')}
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            🏬
                        </span>
                        <span>All Products</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className={`category-nav-item ${navSelected('popular') ? 'selected' : ''}`}
                        onClick={() => setBrowse('popular')}
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            ⭐
                        </span>
                        <span>Popular</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className={`category-nav-item ${navSelected('new') ? 'selected' : ''}`}
                        onClick={() => setBrowse('new')}
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            ✨
                        </span>
                        <span>New Arrivals</span>
                    </button>
                    {mainCategoriesForRail.map((c: any) => (
                        <button
                            key={c.id}
                            type="button"
                            role="tab"
                            className={`category-nav-item ${navSelected(c.id) ? 'selected' : ''}`}
                            onClick={() => setBrowse(null, c.id)}
                        >
                            <CategoryRailIcon mobile_icon_url={c.mobile_icon_url} />
                            <span>{c.name}</span>
                        </button>
                    ))}
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
                    {!browse && filters.sortBy && filters.sortBy !== 'newest' && (
                        <div className="filter-chip">
                            {sortChipLabel(filters.sortBy)}
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
                    {Array.from({ length: 6 }).map((_, i) => (
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
                <div className="empty-state">
                    <h3>No products found</h3>
                    <p>Try adjusting search or filters</p>
                    <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={clearFilters}>
                        Clear filters
                    </button>
                </div>
            ) : (
                <>
                    <VirtualizedProductGrid
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
                                    onAddOne={handleAddOne}
                                    onChangeQty={handleChangeQty}
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

            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                categories={categories}
                brands={brands}
                filters={filterPanelFilters}
                onApply={applyFilters}
                onClear={clearFilters}
            />
        </div>
    );
}
