import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSProduct, POSProductVariant } from '../../../types/pos';
import { InventoryItem } from '../../../types/inventory';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';
import CachedImage from '../../ui/CachedImage';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import Fuse from 'fuse.js';
import { debounce } from 'lodash-es';
import AddOrEditSkuModal from './AddOrEditSkuModal';
import { POSColumnResizeHandle } from './POSColumnResizeHandle';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../utils/apiConnectivity';
import { showAppToast } from '../../../utils/appToast';

export const POS_CATEGORY_TREE_VISIBLE_KEY = 'pos-category-tree-visible';
export const POS_CATEGORY_TREE_W_KEY = 'pos-category-tree-w-px';
const POS_FAST_MOVING_VISIBLE_KEY = 'pos-fast-moving-visible';

const MIN_TREE_W = 140;
const MAX_TREE_W = 360;
const DEFAULT_TREE_W = 220;

/** Exported for POS outer layout (catalog column width when categories are open). */
export const POS_CATEGORY_TREE_MIN_W = MIN_TREE_W;
export const POS_CATEGORY_TREE_MAX_W = MAX_TREE_W;
export const POS_CATEGORY_TREE_DEFAULT_W = DEFAULT_TREE_W;

function loadTreeWidth(): number {
    try {
        const v = localStorage.getItem(POS_CATEGORY_TREE_W_KEY);
        if (v === null) return DEFAULT_TREE_W;
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return DEFAULT_TREE_W;
        return Math.min(MAX_TREE_W, Math.max(MIN_TREE_W, n));
    } catch {
        return DEFAULT_TREE_W;
    }
}

type CategoryTreeNode = { id: string; name: string; children: CategoryTreeNode[] };

function buildCategoryTree(categories: ShopProductCategory[]): CategoryTreeNode[] {
    const byParent = new Map<string | null, ShopProductCategory[]>();
    for (const c of categories) {
        const p = c.parent_id ?? null;
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p)!.push(c);
    }
    const sortFn = (a: ShopProductCategory, b: ShopProductCategory) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    function walk(parentId: string | null): CategoryTreeNode[] {
        const list = (byParent.get(parentId) || []).sort(sortFn);
        return list.map((c) => ({
            id: c.id,
            name: c.name,
            children: walk(c.id)
        }));
    }
    return walk(null);
}

/** Selected id plus all descendant category ids (for tree filtering). */
function getDescendantCategoryIds(categories: ShopProductCategory[], selectedId: string): Set<string> {
    const childrenByParent = new Map<string, string[]>();
    for (const c of categories) {
        if (!c.parent_id) continue;
        if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
        childrenByParent.get(c.parent_id)!.push(c.id);
    }
    const out = new Set<string>([selectedId]);
    const stack = [selectedId];
    while (stack.length) {
        const id = stack.pop()!;
        const kids = childrenByParent.get(id);
        if (!kids) continue;
        for (const k of kids) {
            if (!out.has(k)) {
                out.add(k);
                stack.push(k);
            }
        }
    }
    return out;
}

function mapApiProductToPOS(p: any): POSProduct {
    return {
        id: p.id,
        sku: p.sku || 'N/A',
        barcode: p.barcode || '',
        name: p.name,
        price: Number(p.retail_price) || Number(p.price) || 0,
        cost: Number(p.cost_price) || 0,
        categoryId: p.category_id || 'others',
        subcategoryId: p.subcategory_id || undefined,
        taxRate: Number(p.tax_rate) || 0,
        isTaxInclusive: true,
        unit: p.unit || 'pcs',
        stockLevel: Number(p.stock_quantity) || 0,
        imageUrl: getFullImageUrl(p.image_url),
        popularityScore: p.popularity_score || 0,
        salesDeactivated: Boolean(p.sales_deactivated)
    };
}

function mapInventoryItemToPOS(item: InventoryItem): POSProduct {
    return {
        id: item.id,
        sku: item.sku,
        barcode: item.barcode || '',
        name: item.name,
        price: Number(item.retailPrice) || 0,
        cost: Number(item.costPrice) || 0,
        categoryId: item.category || 'others',
        taxRate: 0,
        isTaxInclusive: true,
        unit: item.unit || 'pcs',
        stockLevel: Number(item.available ?? item.onHand) || 0,
        imageUrl: item.imageUrl,
        popularityScore: 0,
        salesDeactivated: Boolean(item.salesDeactivated)
    };
}

/** When catalog is API-backed but inventory row is missing, still open the SKU editor from grid data. */
function posProductToInventoryStub(p: POSProduct): InventoryItem {
    return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode || undefined,
        name: p.name,
        category: p.categoryId || 'General',
        unit: p.unit || 'pcs',
        onHand: p.stockLevel,
        available: p.stockLevel,
        reserved: 0,
        inTransit: 0,
        damaged: 0,
        costPrice: p.cost,
        retailPrice: p.price,
        reorderPoint: p.reorderPoint ?? 10,
        imageUrl: p.imageUrl,
        description: undefined,
        warehouseStock: {}
    };
}

type SkuModalState =
    | { open: false }
    | { open: true; kind: 'add'; initialQuery: string }
    | { open: true; kind: 'edit'; product: POSProduct };

const CategoryTreeBranch: React.FC<{
    nodes: CategoryTreeNode[];
    depth: number;
    selectedCategory: string;
    expandedIds: Set<string>;
    onToggleExpand: (id: string) => void;
    onSelect: (id: string) => void;
}> = ({ nodes, depth, selectedCategory, expandedIds, onToggleExpand, onSelect }) => (
    <>
        {nodes.map((node) => {
            const hasChildren = node.children.length > 0;
            const expanded = expandedIds.has(node.id);
            const isSelected = selectedCategory === node.id;
            return (
                <div key={node.id}>
                    <div className="flex items-stretch min-h-0" style={{ paddingLeft: depth * 8 }}>
                        {hasChildren ? (
                            <button
                                type="button"
                                className="w-7 shrink-0 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg"
                                onClick={() => onToggleExpand(node.id)}
                                aria-expanded={expanded ? 'true' : 'false'}
                            >
                                {React.cloneElement(
                                    (expanded ? ICONS.chevronDown : ICONS.chevronRight) as any,
                                    { size: 14 }
                                )}
                            </button>
                        ) : (
                            <span className="w-7 shrink-0 inline-block" aria-hidden />
                        )}
                        <button
                            type="button"
                            className={`flex-1 min-w-0 text-left py-1.5 px-2 rounded-[8px] text-xs font-semibold truncate transition-colors ${isSelected
                                ? 'bg-[#0056b3] text-white shadow-sm'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/60'
                                }`}
                            onClick={() => onSelect(node.id)}
                        >
                            {node.name}
                        </button>
                    </div>
                    {hasChildren && expanded && (
                        <CategoryTreeBranch
                            nodes={node.children}
                            depth={depth + 1}
                            selectedCategory={selectedCategory}
                            expandedIds={expandedIds}
                            onToggleExpand={onToggleExpand}
                            onSelect={onSelect}
                        />
                    )}
                </div>
            );
        })}
    </>
);

/** Stable row renderer for react-window — must not be defined inside ProductSearch or the list "blinks" on every parent re-render (e.g. cart updates). */
type POSProductGridRowData = {
    filteredProducts: POSProduct[];
    columnCount: number;
    keyboardIndex: number;
    isDenseMode: boolean;
    addToCart: (product: POSProduct, variant?: POSProductVariant, quantity?: number) => void;
    onProductContextMenu: (e: React.MouseEvent, product: POSProduct) => void;
};

const POS_PRODUCT_GRID_PASTELS = ['bg-[#eef2ff]', 'bg-[#fef3c7]', 'bg-[#e0f2fe]', 'bg-[#fce7f3]'];

function POSProductGridRow({ index, style, data }: ListChildComponentProps<POSProductGridRowData>) {
    const { filteredProducts, columnCount, keyboardIndex, isDenseMode, addToCart, onProductContextMenu } = data;
    const rowItems: React.ReactNode[] = [];
    const cellClass = columnCount === 2 ? 'flex-[0_0_50%] min-w-0 max-w-[50%]' : 'flex-[0_0_33.333%] min-w-0 max-w-[33.333%]';
    for (let i = 0; i < columnCount; i++) {
        const itemIndex = index * columnCount + i;
        if (itemIndex < filteredProducts.length) {
            const product = filteredProducts[itemIndex];
            const isSelected = keyboardIndex === itemIndex;
            const bgClass = POS_PRODUCT_GRID_PASTELS[itemIndex % POS_PRODUCT_GRID_PASTELS.length];
            rowItems.push(
                <div
                    key={product.id}
                    className={`p-2 ${cellClass}`}
                    onContextMenu={(e) => onProductContextMenu(e, product)}
                >
                    <button
                        type="button"
                        onClick={() => product.stockLevel > 0 && addToCart(product)}
                        disabled={product.stockLevel <= 0}
                        className={`group w-full h-full min-h-0 relative flex flex-col p-3 bg-white dark:bg-slate-800 border rounded-[10px] text-left transition-all overflow-hidden shadow-sm ${product.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed border-slate-100 dark:border-slate-700' : 'hover:border-[#0056b3]/40 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]'} ${isSelected ? 'border-[#0056b3] ring-2 ring-[#0056b3]/15' : 'border-slate-200/90 dark:border-slate-700'
                            }`}
                    >
                        <div className={`w-full flex-shrink-0 ${bgClass} dark:bg-slate-700/80 rounded-[8px] flex items-center justify-center border border-white/50 dark:border-slate-600 overflow-hidden relative ${isDenseMode ? 'aspect-video max-h-[72px]' : 'aspect-square'}`}>
                            <CachedImage
                                path={product.imageUrl}
                                alt={product.name}
                                fallbackLabel={product.name}
                                fallbackClassName={
                                    isDenseMode
                                        ? '!p-0.5 [&_span]:text-[8px] [&_span]:leading-tight [&_span]:line-clamp-3'
                                        : ''
                                }
                                className="object-cover w-full h-full min-h-0 min-w-0 group-hover:scale-105 transition-transform duration-500"
                            />
                            {product.stockLevel <= (product.reorderPoint || 10) && (
                                <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-[6px] text-xs font-bold uppercase tracking-wider shadow-sm ${product.stockLevel <= 0 ? 'bg-slate-800 text-white' : 'bg-[#fee2e2] text-[#991b1b] dark:bg-rose-950/80 dark:text-rose-200'}`}>
                                    {product.stockLevel <= 0 ? 'Out' : `Low: ${product.stockLevel}`}
                                </div>
                            )}
                        </div>

                        <div className={`flex-shrink-0 font-semibold text-slate-900 dark:text-slate-200 line-clamp-2 leading-tight mt-2 min-h-0 ${isDenseMode ? 'text-xs h-[1.75rem]' : 'text-sm h-[2.5rem]'}`}>
                            {product.name}
                        </div>

                        <div className="flex flex-shrink-0 items-center justify-between mt-1">
                            <span className={`font-bold text-[#0056b3] dark:text-blue-400 truncate ${isDenseMode ? 'text-xs' : 'text-sm'}`}>
                                {CURRENCY}{product.price.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                Stock: {product.stockLevel}
                            </span>
                        </div>
                    </button>
                </div>
            );
        } else {
            rowItems.push(<div key={`empty-${i}`} className={`p-2 ${cellClass}`}></div>);
        }
    }
    return <div style={style} className="flex px-3 min-h-0 overflow-hidden">{rowItems}</div>;
}

const ProductSearch: React.FC = () => {
    const {
        addToCart,
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        isDenseMode,
        isPaymentModalOpen,
        isHeldSalesModalOpen,
        isCustomerModalOpen,
        isSalesHistoryModalOpen
    } = usePOS();
    const { items: inventoryItems } = useInventory();
    const inventoryItemsRef = useRef(inventoryItems);
    inventoryItemsRef.current = inventoryItems;

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [popularProducts, setPopularProducts] = useState<POSProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [keyboardIndex, setKeyboardIndex] = useState(-1);
    const [showFilters, setShowFilters] = useState(false);
    const [skuModal, setSkuModal] = useState<SkuModalState>({ open: false });
    const [productContextMenu, setProductContextMenu] = useState<{
        x: number;
        y: number;
        product: POSProduct;
    } | null>(null);

    const [categoryTreeVisible, setCategoryTreeVisible] = useState(() => {
        try {
            const v = localStorage.getItem(POS_CATEGORY_TREE_VISIBLE_KEY);
            if (v === null) return false;
            return v === 'true';
        } catch {
            return false;
        }
    });
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
    const [categoryTreeWidthPx, setCategoryTreeWidthPx] = useState(loadTreeWidth);

    const emitCategoryTreeLayout = useCallback((visible: boolean, treeW: number) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(
            new CustomEvent('pos:category-tree-visibility', {
                detail: { visible, treeWidthPx: treeW }
            })
        );
    }, []);

    const persistCategoryTreeWidth = useCallback(
        (w: number) => {
            const clamped = Math.min(MAX_TREE_W, Math.max(MIN_TREE_W, Math.round(w)));
            setCategoryTreeWidthPx(clamped);
            try {
                localStorage.setItem(POS_CATEGORY_TREE_W_KEY, String(clamped));
            } catch {
                /* ignore */
            }
            emitCategoryTreeLayout(true, clamped);
        },
        [emitCategoryTreeLayout]
    );

    const startResizeCategoryTree = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = categoryTreeWidthPx;
            const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                persistCategoryTreeWidth(startW + dx);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [categoryTreeWidthPx, persistCategoryTreeWidth]
    );

    const persistCategoryTreeVisible = useCallback(
        (visible: boolean) => {
            setCategoryTreeVisible(visible);
            try {
                localStorage.setItem(POS_CATEGORY_TREE_VISIBLE_KEY, String(visible));
            } catch {
                /* ignore */
            }
            emitCategoryTreeLayout(visible, categoryTreeWidthPx);
        },
        [categoryTreeWidthPx, emitCategoryTreeLayout]
    );

    const [fastMovingVisible, setFastMovingVisible] = useState(() => {
        try {
            const v = localStorage.getItem(POS_FAST_MOVING_VISIBLE_KEY);
            if (v === null) return true;
            return v === 'true';
        } catch {
            return true;
        }
    });

    const persistFastMovingVisible = useCallback((visible: boolean) => {
        setFastMovingVisible(visible);
        try {
            localStorage.setItem(POS_FAST_MOVING_VISIBLE_KEY, String(visible));
        } catch {
            /* ignore */
        }
    }, []);

    // Internal search state for debouncing
    const [localQuery, setLocalQuery] = useState(searchQuery);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<FixedSizeList>(null);

    const focusPosSearch = useCallback(() => {
        searchInputRef.current?.focus({ preventScroll: true });
    }, []);

    /** Keep the catalog search focused for keyboard-wedge barcode scanners, except while typing in other fields or in modals. */
    const shouldRestorePosSearchFocus = useCallback(
        (target: EventTarget | null) => {
            if (!(target instanceof Element)) return true;
            if (skuModal.open) return false;
            if (
                isPaymentModalOpen ||
                isHeldSalesModalOpen ||
                isCustomerModalOpen ||
                isSalesHistoryModalOpen
            ) {
                return false;
            }
            if (target.closest('[role="dialog"]')) return false;
            if (target instanceof HTMLElement && target.isContentEditable) return false;

            if (target.id === 'pos-product-search') return false;

            if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
                return false;
            }
            if (target instanceof HTMLInputElement) {
                const t = (target.type || 'text').toLowerCase();
                const textLike =
                    t === 'text' ||
                    t === 'search' ||
                    t === 'number' ||
                    t === 'tel' ||
                    t === 'url' ||
                    t === 'email' ||
                    t === 'password' ||
                    t === '';
                if (textLike) {
                    if (target.id === 'tender-amount-input') return false;
                    if (target.closest('#pos-cart-panel')) return false;
                    return false;
                }
            }

            return true;
        },
        [
            skuModal.open,
            isPaymentModalOpen,
            isHeldSalesModalOpen,
            isCustomerModalOpen,
            isSalesHistoryModalOpen
        ]
    );

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!shouldRestorePosSearchFocus(e.target)) return;
            requestAnimationFrame(() => {
                if (!shouldRestorePosSearchFocus(document.activeElement)) return;
                focusPosSearch();
            });
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, [shouldRestorePosSearchFocus, focusPosSearch]);

    const loadShopCategories = useCallback(async () => {
        try {
            const list = await getShopCategoriesOfflineFirst();
            setShopCategories(Array.isArray(list) ? list : []);
        } catch {
            setShopCategories([]);
        }
    }, []);

    const loadProducts = useCallback(async () => {
        try {
            setLoadError(null);
            setIsLoading(true);
            const response = await shopApi.getProducts();
            if (response && Array.isArray(response)) {
                setProducts(response.map(mapApiProductToPOS));
            } else {
                setProducts([]);
            }
        } catch (error) {
            const fallback = inventoryItemsRef.current;
            if (fallback?.length) {
                setProducts(fallback.map(mapInventoryItemToPOS));
                setLoadError(null);
                if (isApiConnectivityFailure(error)) {
                    showAppToast(
                        userMessageForApiError(error, 'Product list could not be refreshed from the server; showing cached inventory.'),
                        'error',
                        6000
                    );
                }
            } else {
                setLoadError(userMessageForApiError(error, 'Unable to load products.'));
                setProducts([]);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadPopularProducts = useCallback(async () => {
        try {
            const response = await shopApi.getPopularProducts(6);
            if (response && Array.isArray(response)) {
                setPopularProducts(response.map(mapApiProductToPOS));
            }
        } catch (error) {
            console.error('Failed to load popular products:', error);
            if (isApiConnectivityFailure(error)) {
                showAppToast(userMessageForApiError(error, 'Could not load fast-moving products.'), 'error');
            }
        }
    }, []);

    useEffect(() => {
        loadProducts();
        loadShopCategories();
        loadPopularProducts();
    }, [loadProducts, loadShopCategories, loadPopularProducts]);

    useEffect(() => {
        const t = window.setTimeout(() => focusPosSearch(), 0);
        return () => clearTimeout(t);
    }, [focusPosSearch]);

    const categoryTree = useMemo(() => buildCategoryTree(shopCategories), [shopCategories]);

    const parentIdsWithChildren = useMemo(() => {
        const s = new Set<string>();
        for (const c of shopCategories) {
            if (c.parent_id) s.add(c.parent_id);
        }
        return s;
    }, [shopCategories]);

    useEffect(() => {
        setExpandedCategoryIds(new Set(parentIdsWithChildren));
    }, [parentIdsWithChildren]);

    const toggleCategoryExpand = useCallback((id: string) => {
        setExpandedCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectedCategoryIdSet = useMemo(() => {
        if (selectedCategory === 'all') return null;
        return getDescendantCategoryIds(shopCategories, selectedCategory);
    }, [selectedCategory, shopCategories]);

    // Merge inventory into products: stock (branch-aware), and name/price/image/SKU so edits reflect without refetching the catalog API.
    const productsWithStock = useMemo(() => {
        if (!inventoryItems?.length) return products;
        return products.map((p) => {
            const inv = inventoryItems.find((i) => i.id === p.id);
            const branchStock =
                selectedBranchId && inv?.warehouseStock
                    ? (inv.warehouseStock[selectedBranchId] ?? 0)
                    : (inv?.onHand ?? p.stockLevel);
            const stockLevel = inv ? branchStock : p.stockLevel;
            const merged =
                inv != null
                    ? {
                          ...p,
                          name: inv.name,
                          sku: inv.sku,
                          barcode: inv.barcode ?? p.barcode,
                          price: Number(inv.retailPrice) || p.price,
                          cost: Number(inv.costPrice) || p.cost,
                          imageUrl: inv.imageUrl ?? p.imageUrl,
                          categoryId: inv.category || p.categoryId,
                          salesDeactivated: inv.salesDeactivated ?? p.salesDeactivated
                      }
                    : p;
            return {
                ...merged,
                stockLevel: Number(stockLevel) || 0,
                reorderPoint: inv?.reorderPoint ?? p.reorderPoint ?? 10
            };
        });
    }, [products, inventoryItems, selectedBranchId]);

    /** SKUs manually deactivated for sales stay out of POS grid and barcode add (still in inventory for reactivation). */
    const productsForPOSCatalog = useMemo(
        () => productsWithStock.filter((p) => !p.salesDeactivated),
        [productsWithStock]
    );

    /** Same merge as main grid — popular list API can lag or omit branch qty; inventory keeps labels and stock in sync. */
    const popularProductsWithStock = useMemo(() => {
        if (!popularProducts.length) return [];
        return popularProducts.map((p) => {
            const inv = inventoryItems?.find((i) => i.id === p.id);
            const branchStock =
                selectedBranchId && inv?.warehouseStock
                    ? (inv.warehouseStock[selectedBranchId] ?? 0)
                    : (inv?.onHand ?? p.stockLevel);
            const stockLevel = inv ? branchStock : p.stockLevel;
            const merged =
                inv != null
                    ? {
                          ...p,
                          name: inv.name,
                          sku: inv.sku,
                          barcode: inv.barcode ?? p.barcode,
                          price: Number(inv.retailPrice) || p.price,
                          cost: Number(inv.costPrice) || p.cost,
                          imageUrl: inv.imageUrl ?? p.imageUrl,
                          categoryId: inv.category || p.categoryId,
                          salesDeactivated: inv.salesDeactivated ?? p.salesDeactivated
                      }
                    : p;
            return {
                ...merged,
                stockLevel: Number(stockLevel) || 0,
                reorderPoint: inv?.reorderPoint ?? p.reorderPoint ?? 10
            };
        });
    }, [popularProducts, inventoryItems, selectedBranchId]);

    const popularProductsForPOS = useMemo(
        () => popularProductsWithStock.filter((p) => !p.salesDeactivated),
        [popularProductsWithStock]
    );

    // Update local query when external search query changes (e.g. from barcode scanner)
    useEffect(() => {
        setLocalQuery(searchQuery);
    }, [searchQuery]);

    // Handle debounced search
    const debouncedSetGlobalSearch = useMemo(
        () => debounce((q: string) => setSearchQuery(q), 200),
        [setSearchQuery]
    );

    const handleSearchChange = (val: string) => {
        setLocalQuery(val);
        debouncedSetGlobalSearch(val);
        setKeyboardIndex(-1);
    };

    const [gridHeight, setGridHeight] = useState(600);
    const gridContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const obs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setGridHeight(entry.contentRect.height);
            }
        });
        if (gridContainerRef.current) obs.observe(gridContainerRef.current);
        return () => obs.disconnect();
    }, []);

    const fuse = useMemo(() => {
        return new Fuse(productsForPOSCatalog, {
            keys: ['name', 'sku', 'barcode', 'categoryId', 'subcategoryId'],
            threshold: 0.3,
            distance: 100,
            ignoreLocation: true,
        });
    }, [productsForPOSCatalog]);

    const filteredProducts = useMemo(() => {
        let result = productsForPOSCatalog;

        // Category Filter (tree node = node + descendants; matches categoryId / subcategoryId)
        if (selectedCategory !== 'all' && selectedCategoryIdSet) {
            result = result.filter((p) => {
                if (selectedCategoryIdSet.has(p.categoryId)) return true;
                if (p.subcategoryId && selectedCategoryIdSet.has(p.subcategoryId)) return true;
                const cat = shopCategories.find((c) => c.id === selectedCategory);
                return cat ? p.categoryId === cat.name : false;
            });
        }

        // Search Query
        const query = localQuery.toLowerCase().trim();
        if (query) {
            // Check for exact barcode match first (Speed optimization)
            const exactBarcode = productsForPOSCatalog.find(p => p.barcode && p.barcode.toLowerCase() === query);
            if (exactBarcode) return [exactBarcode];

            // Fuzzy match
            const fuzzyResults = fuse.search(query);
            result = fuzzyResults.map(r => r.item);
        }

        return result;
    }, [productsForPOSCatalog, selectedCategory, selectedCategoryIdSet, localQuery, fuse, shopCategories]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (document.activeElement !== searchInputRef.current) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setKeyboardIndex(prev => {
                    const next = Math.min(prev + 1, filteredProducts.length - 1);
                    const nextRow = Math.floor(next / columnCount);
                    listRef.current?.scrollToItem(nextRow);
                    return next;
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setKeyboardIndex(prev => {
                    const next = Math.max(prev - 1, -1);
                    if (next >= 0) {
                        const nextRow = Math.floor(next / columnCount);
                        listRef.current?.scrollToItem(nextRow);
                    }
                    return next;
                });
            } else if (e.key === 'Enter') {
                if (justAddedFromBarcodeRef.current) {
                    justAddedFromBarcodeRef.current = false;
                    setLocalQuery('');
                    setSearchQuery('');
                    setKeyboardIndex(-1);
                    return;
                }
                // Barcode scanner types digits then sends Enter — only the barcode effect should add (one quantity per scan)
                const trimmed = localQuery.trim();
                const isBarcodeScan = /^\d+$/.test(trimmed) && filteredProducts.length === 1 && filteredProducts[0].barcode === trimmed;
                if (isBarcodeScan) {
                    setLocalQuery('');
                    setSearchQuery('');
                    setKeyboardIndex(-1);
                    return;
                }
                if (keyboardIndex >= 0 && filteredProducts[keyboardIndex]) {
                    addToCart(filteredProducts[keyboardIndex]);
                    setKeyboardIndex(-1);
                    setLocalQuery('');
                    setSearchQuery('');
                } else if (filteredProducts.length === 1) {
                    addToCart(filteredProducts[0]);
                    setLocalQuery('');
                    setSearchQuery('');
                }
            } else if (e.key === 'Escape') {
                setLocalQuery('');
                setSearchQuery('');
                setKeyboardIndex(-1);
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [filteredProducts, keyboardIndex, addToCart, setSearchQuery, localQuery]);

    // Handle barcode "instant add" — debounced and guarded to prevent multiple adds per scan
    const barcodeAddTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastAddedBarcodeRef = useRef<string | null>(null);
    const lastBarcodeAddTimeRef = useRef<number>(0);
    const justAddedFromBarcodeRef = useRef(false);

    useEffect(() => {
        const query = localQuery.trim();
        if (!query || query.length < 3) {
            if (barcodeAddTimeoutRef.current) {
                clearTimeout(barcodeAddTimeoutRef.current);
                barcodeAddTimeoutRef.current = null;
            }
            return;
        }

        const isNumeric = /^\d+$/.test(query);
        if (!isNumeric) return;

        const exactMatch = productsForPOSCatalog.find(p => p.barcode === query);
        if (!exactMatch) return;

        // Cooldown: avoid adding the same barcode again within 800ms (e.g. effect re-run or Strict Mode)
        const now = Date.now();
        if (lastAddedBarcodeRef.current === query && now - lastBarcodeAddTimeRef.current < 800) {
            return;
        }

        // Debounce: wait for input to settle (scanner types fast, then stops)
        if (barcodeAddTimeoutRef.current) clearTimeout(barcodeAddTimeoutRef.current);
        barcodeAddTimeoutRef.current = setTimeout(() => {
            barcodeAddTimeoutRef.current = null;
            const currentMatch = productsForPOSCatalog.find(p => p.barcode === query);
            if (!currentMatch) return;
            const n = Date.now();
            if (lastAddedBarcodeRef.current === query && n - lastBarcodeAddTimeRef.current < 800) return;

            lastAddedBarcodeRef.current = query;
            lastBarcodeAddTimeRef.current = n;
            justAddedFromBarcodeRef.current = true;
            addToCart(currentMatch, undefined, 1);
            setLocalQuery('');
            setSearchQuery('');
            focusPosSearch();
            setTimeout(() => { justAddedFromBarcodeRef.current = false; }, 500);
        }, 200);
        return () => {
            if (barcodeAddTimeoutRef.current) {
                clearTimeout(barcodeAddTimeoutRef.current);
                barcodeAddTimeoutRef.current = null;
            }
        };
    }, [localQuery, productsForPOSCatalog, addToCart, setSearchQuery, focusPosSearch]);

    const initialEditingItemForModal = useMemo((): InventoryItem | null => {
        if (!skuModal.open || skuModal.kind !== 'edit') return null;
        const p = skuModal.product;
        return inventoryItems.find((i) => i.id === p.id) ?? posProductToInventoryStub(p);
    }, [skuModal, inventoryItems]);

    const handleProductContextMenu = useCallback((e: React.MouseEvent, product: POSProduct) => {
        e.preventDefault();
        e.stopPropagation();
        const pad = 8;
        const mw = 200;
        const mh = 100;
        let x = e.clientX;
        let y = e.clientY;
        if (typeof window !== 'undefined') {
            x = Math.min(x, window.innerWidth - mw - pad);
            y = Math.min(y, window.innerHeight - mh - pad);
            x = Math.max(pad, x);
            y = Math.max(pad, y);
        }
        setProductContextMenu({ x, y, product });
    }, []);

    useEffect(() => {
        if (!productContextMenu) return;
        const onDown = (e: MouseEvent) => {
            const el = document.getElementById('pos-product-context-menu');
            if (el && e.target instanceof Node && el.contains(e.target)) return;
            setProductContextMenu(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setProductContextMenu(null);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [productContextMenu]);

    // Virtualized Grid Setup — dense by default; row height sized so content doesn't overlap
    const columnCount = isDenseMode ? 3 : 2;
    const rowCount = Math.ceil(filteredProducts.length / columnCount);
    const rowHeight = isDenseMode ? 156 : 200;

    const productGridItemData = useMemo(
        (): POSProductGridRowData => ({
            filteredProducts,
            columnCount,
            keyboardIndex,
            isDenseMode,
            addToCart,
            onProductContextMenu: handleProductContextMenu
        }),
        [filteredProducts, columnCount, keyboardIndex, isDenseMode, addToCart, handleProductContextMenu]
    );

    return (
        <div className="flex flex-row h-full min-h-0 bg-[#f8fafc] dark:bg-slate-900 relative overflow-hidden">
            {categoryTreeVisible ? (
                <aside
                    className="shrink-0 flex flex-col border-r border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800/50 min-h-0"
                    style={{ width: categoryTreeWidthPx, minWidth: MIN_TREE_W, maxWidth: MAX_TREE_W }}
                >
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-[#eef2ff]/50 dark:bg-slate-800/90 shrink-0">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#0056b3] dark:text-blue-400">Categories</span>
                        <button
                            type="button"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-500 transition-colors"
                            onClick={() => persistCategoryTreeVisible(false)}
                            title="Hide categories"
                            aria-label="Hide category tree"
                        >
                            {React.cloneElement(ICONS.chevronLeft as any, { size: 16 })}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto pos-scrollbar p-2 min-h-0">
                        <button
                            type="button"
                            onClick={() => setSelectedCategory('all')}
                            className={`w-full text-left px-3 py-2.5 rounded-[10px] text-xs font-bold transition-all mb-1 ${selectedCategory === 'all'
                                ? 'bg-[#0056b3] text-white shadow-md shadow-[#0056b3]/25'
                                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-[#0056b3]/25 dark:hover:border-slate-500'
                                }`}
                        >
                            All
                        </button>
                        {categoryTree.length > 0 ? (
                            <CategoryTreeBranch
                                nodes={categoryTree}
                                depth={0}
                                selectedCategory={selectedCategory}
                                expandedIds={expandedCategoryIds}
                                onToggleExpand={toggleCategoryExpand}
                                onSelect={setSelectedCategory}
                            />
                        ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-3">No categories yet. Add categories in inventory settings.</p>
                        )}
                    </div>
                </aside>
            ) : null}
            {categoryTreeVisible ? (
                <POSColumnResizeHandle
                    aria-label="Resize categories and product list"
                    onMouseDown={startResizeCategoryTree}
                />
            ) : null}
            {!categoryTreeVisible ? (
                <button
                    type="button"
                    className="w-9 shrink-0 flex flex-col items-center justify-center gap-1 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    onClick={() => persistCategoryTreeVisible(true)}
                    title="Show categories"
                    aria-label="Show category tree"
                >
                    {React.cloneElement(ICONS.chevronRight as any, { size: 16 })}
                    {React.cloneElement(ICONS.layers as any, { size: 12 })}
                </button>
            ) : null}

            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                {/* Search Bar - Premium Fixed Header */}
                <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700 p-4">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 group-focus-within:text-[#0056b3] dark:group-focus-within:text-blue-400 transition-colors">
                            {React.cloneElement(ICONS.search as any, { size: 18 })}
                        </div>
                        <input
                            ref={searchInputRef}
                            id="pos-product-search"
                            type="text"
                            className="w-full pl-11 pr-24 py-3 bg-slate-100/80 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-600 rounded-[10px] text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] transition-all select-text"
                            placeholder="Search or scan barcode… (F1)"
                            value={localQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                        <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                            {localQuery && (
                                <button onClick={() => handleSearchChange('')} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-400 dark:text-slate-500">
                                    {React.cloneElement(ICONS.x as any, { size: 14 })}
                                </button>
                            )}
                            <span className="kbd-tag">F1</span>
                        </div>
                    </div>
                </div>

            {/* Popular / Frequent Items Section */}
            {!localQuery && selectedCategory === 'all' && popularProductsForPOS.length > 0 && fastMovingVisible && (
                <div className="px-4 py-3 bg-[#eef2ff]/60 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2 mb-3 px-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1 h-4 bg-[#0056b3] rounded-full shrink-0" />
                            <h3 className="text-xs font-bold text-[#0056b3] dark:text-blue-400 uppercase tracking-wider truncate">Fast moving items</h3>
                        </div>
                        <button
                            type="button"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-500 transition-colors shrink-0"
                            onClick={() => persistFastMovingVisible(false)}
                            title="Hide fast moving items"
                            aria-label="Hide fast moving items"
                        >
                            {React.cloneElement(ICONS.arrowUp as any, { size: 16 })}
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {popularProductsForPOS.map(p => (
                            <div
                                key={p.id}
                                onContextMenu={(e) => handleProductContextMenu(e, p)}
                                className="min-w-0"
                            >
                            <button
                                type="button"
                                onClick={() => p.stockLevel > 0 && addToCart(p)}
                                disabled={p.stockLevel <= 0}
                                className={`w-full flex flex-col items-center p-2 rounded-[10px] border transition-all ${p.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700' : 'bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 hover:border-[#0056b3]/35 hover:shadow-sm active:scale-95'}`}
                            >
                                <div className="w-10 h-10 rounded-[8px] bg-[#eef2ff] dark:bg-slate-700/80 flex items-center justify-center mb-1 overflow-hidden">
                                    <CachedImage
                                        path={p.imageUrl}
                                        alt={p.name}
                                        fallbackLabel={p.name}
                                        fallbackClassName="!p-0.5 !text-[7px] leading-none"
                                        className="h-full w-full min-h-0 min-w-0 object-cover"
                                    />
                                </div>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate w-full text-center">{p.name}</span>
                            </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {!localQuery && selectedCategory === 'all' && popularProductsForPOS.length > 0 && !fastMovingVisible && (
                <div className="px-4 py-2 bg-[#eef2ff]/40 dark:bg-slate-800/30 border-b border-slate-200/80 dark:border-slate-700">
                    <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200/90 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 py-2 px-3 text-xs font-semibold text-[#0056b3] dark:text-blue-400 hover:border-[#0056b3]/35 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                        onClick={() => persistFastMovingVisible(true)}
                        title="Show fast moving items"
                        aria-label="Show fast moving items"
                    >
                        {React.cloneElement(ICONS.trendingUp as any, { size: 14 })}
                        <span>Show fast moving items</span>
                        {React.cloneElement(ICONS.chevronDown as any, { size: 14 })}
                    </button>
                </div>
            )}

            {/* Main Product Grid - Virtualized */}
            <div ref={gridContainerRef} className="flex-1 overflow-hidden pointer-events-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300 dark:text-slate-600">
                        <div className="w-10 h-10 border-4 border-slate-100 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-xs font-bold uppercase tracking-widest">Loading Catalog...</span>
                    </div>
                ) : filteredProducts.length > 0 ? (
                    <FixedSizeList
                        ref={listRef}
                        height={gridHeight}
                        itemCount={rowCount}
                        itemSize={rowHeight}
                        width="100%"
                        className="pos-scrollbar"
                        itemData={productGridItemData}
                    >
                        {POSProductGridRow}
                    </FixedSizeList>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-200 dark:text-slate-600">
                            {React.cloneElement(ICONS.search as any, { size: 32 })}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">No products found</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[220px]">
                            {localQuery.trim()
                                ? 'Add this SKU/barcode to inventory or search for an existing one to edit.'
                                : 'Try adjusting your search query or category filters'}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                            {localQuery.trim() && (
                                <button
                                    type="button"
                                    onClick={() => setSkuModal({ open: true, kind: 'add', initialQuery: localQuery.trim() })}
                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2"
                                >
                                    {React.cloneElement(ICONS.plus as any, { size: 14 })}
                                    Add SKU to inventory
                                </button>
                            )}
                            <button
                                onClick={() => { setLocalQuery(''); setSearchQuery(''); setSelectedCategory('all'); }}
                                className="px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold uppercase tracking-widest rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg"
                            >
                                Reset Catalog
                            </button>
                        </div>
                    </div>
                )}
            </div>

                {/* Bottom Status / Mode Toggle */}
                <div className="p-3 bg-white dark:bg-slate-800/50 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Showing: <span className="text-slate-900 dark:text-slate-100">{filteredProducts.length}</span></span>
                    </div>
                    {/* Dense Mode Toggle is handled by ShortcutBar, but we can add minor UI here if needed */}
                </div>
            </div>

            {productContextMenu ? (
                <div
                    id="pos-product-context-menu"
                    role="menu"
                    className="fixed z-[10050] min-w-[180px] rounded-xl border border-slate-200/90 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-xl shadow-slate-900/15"
                    style={{ left: productContextMenu.x, top: productContextMenu.y }}
                >
                    <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
                        onClick={() => {
                            setSkuModal({ open: true, kind: 'edit', product: productContextMenu.product });
                            setProductContextMenu(null);
                        }}
                    >
                        {React.cloneElement(ICONS.edit as any, { size: 16, className: 'text-slate-500 dark:text-slate-400 shrink-0' })}
                        Edit product…
                    </button>
                </div>
            ) : null}

            <AddOrEditSkuModal
                isOpen={skuModal.open}
                onClose={() => setSkuModal({ open: false })}
                initialSkuOrBarcode={skuModal.open && skuModal.kind === 'add' ? skuModal.initialQuery : ''}
                initialEditingItem={initialEditingItemForModal}
                onItemReady={(item, action) => {
                    if (action === 'updated') return;
                    const posProduct = mapInventoryItemToPOS(item);
                    addToCart(posProduct);
                    setLocalQuery('');
                    setSearchQuery('');
                }}
            />
        </div>
    );
};

export default ProductSearch;
