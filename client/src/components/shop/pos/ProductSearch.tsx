import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSProduct } from '../../../types/pos';
import { InventoryItem } from '../../../types/inventory';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';
import CachedImage from '../../ui/CachedImage';
import { FixedSizeList } from 'react-window';
import Fuse from 'fuse.js';
import { debounce } from 'lodash-es';
import AddOrEditSkuModal from './AddOrEditSkuModal';
import { POSColumnResizeHandle } from './POSColumnResizeHandle';

const POS_CATEGORY_TREE_VISIBLE_KEY = 'pos-category-tree-visible';
const POS_CATEGORY_TREE_W_KEY = 'pos-category-tree-w-px';

const MIN_TREE_W = 140;
const MAX_TREE_W = 360;
const DEFAULT_TREE_W = 220;

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
        popularityScore: p.popularity_score || 0
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
        stockLevel: Number(item.onHand) || 0,
        imageUrl: item.imageUrl,
        popularityScore: 0
    };
}

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

const ProductSearch: React.FC = () => {
    const {
        addToCart,
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        isDenseMode
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
    const [isAddSkuModalOpen, setIsAddSkuModalOpen] = useState(false);

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

    const persistCategoryTreeWidth = useCallback((w: number) => {
        const clamped = Math.min(MAX_TREE_W, Math.max(MIN_TREE_W, Math.round(w)));
        setCategoryTreeWidthPx(clamped);
        try {
            localStorage.setItem(POS_CATEGORY_TREE_W_KEY, String(clamped));
        } catch {
            /* ignore */
        }
    }, []);

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

    const persistCategoryTreeVisible = useCallback((visible: boolean) => {
        setCategoryTreeVisible(visible);
        try {
            localStorage.setItem(POS_CATEGORY_TREE_VISIBLE_KEY, String(visible));
        } catch {
            /* ignore */
        }
    }, []);

    // Internal search state for debouncing
    const [localQuery, setLocalQuery] = useState(searchQuery);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<FixedSizeList>(null);

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
            } else {
                setLoadError('Unable to load products.');
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
        }
    }, []);

    useEffect(() => {
        loadProducts();
        loadShopCategories();
        loadPopularProducts();
    }, [loadProducts, loadShopCategories, loadPopularProducts]);

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

    // Merge inventory stock into products so POS shows correct stock (branch-specific when branch selected)
    const productsWithStock = useMemo(() => {
        if (!inventoryItems?.length) return products;
        return products.map((p) => {
            const inv = inventoryItems.find((i) => i.id === p.id);
            const branchStock =
                selectedBranchId && inv?.warehouseStock
                    ? (inv.warehouseStock[selectedBranchId] ?? 0)
                    : (inv?.onHand ?? p.stockLevel);
            const stockLevel = inv ? branchStock : p.stockLevel;
            return {
                ...p,
                stockLevel: Number(stockLevel) || 0,
                reorderPoint: inv?.reorderPoint ?? p.reorderPoint ?? 10
            };
        });
    }, [products, inventoryItems, selectedBranchId]);

    /** Same stock merge as main grid — popular list API can lag or omit branch qty; without this, fast-moving tiles stay disabled. */
    const popularProductsWithStock = useMemo(() => {
        if (!popularProducts.length) return [];
        return popularProducts.map((p) => {
            const inv = inventoryItems?.find((i) => i.id === p.id);
            const branchStock =
                selectedBranchId && inv?.warehouseStock
                    ? (inv.warehouseStock[selectedBranchId] ?? 0)
                    : (inv?.onHand ?? p.stockLevel);
            const stockLevel = inv ? branchStock : p.stockLevel;
            return {
                ...p,
                stockLevel: Number(stockLevel) || 0,
                reorderPoint: inv?.reorderPoint ?? p.reorderPoint ?? 10
            };
        });
    }, [popularProducts, inventoryItems, selectedBranchId]);

    // Update local query when external search query changes (e.g. from barcode scanner)
    useEffect(() => {
        setLocalQuery(searchQuery);
    }, [searchQuery]);

    // Handle debounced search
    const debouncedSetGlobalSearch = useMemo(
        () => debounce((q: string) => setSearchQuery(q), 150),
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
        return new Fuse(productsWithStock, {
            keys: ['name', 'sku', 'barcode', 'categoryId', 'subcategoryId'],
            threshold: 0.3,
            distance: 100,
            ignoreLocation: true,
        });
    }, [productsWithStock]);

    const filteredProducts = useMemo(() => {
        let result = productsWithStock;

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
            const exactBarcode = productsWithStock.find(p => p.barcode && p.barcode.toLowerCase() === query);
            if (exactBarcode) return [exactBarcode];

            // Fuzzy match
            const fuzzyResults = fuse.search(query);
            result = fuzzyResults.map(r => r.item);
        }

        return result;
    }, [productsWithStock, selectedCategory, selectedCategoryIdSet, localQuery, fuse, shopCategories]);

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

        const exactMatch = productsWithStock.find(p => p.barcode === query);
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
            const currentMatch = productsWithStock.find(p => p.barcode === query);
            if (!currentMatch) return;
            const n = Date.now();
            if (lastAddedBarcodeRef.current === query && n - lastBarcodeAddTimeRef.current < 800) return;

            lastAddedBarcodeRef.current = query;
            lastBarcodeAddTimeRef.current = n;
            justAddedFromBarcodeRef.current = true;
            addToCart(currentMatch, undefined, 1);
            setLocalQuery('');
            setSearchQuery('');
            setTimeout(() => { justAddedFromBarcodeRef.current = false; }, 500);
        }, 300);
        return () => {
            if (barcodeAddTimeoutRef.current) {
                clearTimeout(barcodeAddTimeoutRef.current);
                barcodeAddTimeoutRef.current = null;
            }
        };
    }, [localQuery, productsWithStock, addToCart, setSearchQuery]);

    // Virtualized Grid Setup — dense by default; row height sized so content doesn't overlap
    const columnCount = isDenseMode ? 3 : 2;
    const rowCount = Math.ceil(filteredProducts.length / columnCount);
    const rowHeight = isDenseMode ? 156 : 200;

    const pastelBgs = ['bg-[#eef2ff]', 'bg-[#fef3c7]', 'bg-[#e0f2fe]', 'bg-[#fce7f3]'];

    const ProductRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const rowItems: any[] = [];
        const cellClass = columnCount === 2 ? 'flex-[0_0_50%] min-w-0 max-w-[50%]' : 'flex-[0_0_33.333%] min-w-0 max-w-[33.333%]';
        for (let i = 0; i < columnCount; i++) {
            const itemIndex = index * columnCount + i;
            if (itemIndex < filteredProducts.length) {
                const product = filteredProducts[itemIndex];
                const isSelected = keyboardIndex === itemIndex;
                const bgClass = pastelBgs[itemIndex % pastelBgs.length];
                rowItems.push(
                    <div key={product.id} className={`p-2 ${cellClass}`}>
                        <button
                            onClick={() => product.stockLevel > 0 && addToCart(product)}
                            disabled={product.stockLevel <= 0}
                            className={`group w-full h-full min-h-0 relative flex flex-col p-3 bg-white dark:bg-slate-800 border rounded-[10px] text-left transition-all overflow-hidden shadow-sm ${product.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed border-slate-100 dark:border-slate-700' : 'hover:border-[#0056b3]/40 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]'} ${isSelected ? 'border-[#0056b3] ring-2 ring-[#0056b3]/15' : 'border-slate-200/90 dark:border-slate-700'
                                }`}
                        >
                            <div className={`w-full flex-shrink-0 ${bgClass} dark:bg-slate-700/80 rounded-[8px] flex items-center justify-center border border-white/50 dark:border-slate-600 overflow-hidden relative ${isDenseMode ? 'aspect-video max-h-[72px]' : 'aspect-square'}`}>
                                {product.imageUrl ? (
                                    <CachedImage path={product.imageUrl} alt={product.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="text-slate-300 dark:text-slate-500">
                                        {React.cloneElement(ICONS.package as any, { size: isDenseMode ? 24 : 40 })}
                                    </div>
                                )}
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
    };

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
                            placeholder="Search by name, category, or scan SKU… (Ctrl+F)"
                            value={localQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                        <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                            {localQuery && (
                                <button onClick={() => handleSearchChange('')} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-400 dark:text-slate-500">
                                    {React.cloneElement(ICONS.x as any, { size: 14 })}
                                </button>
                            )}
                            <span className="kbd-tag">F4</span>
                        </div>
                    </div>
                </div>

            {/* Popular / Frequent Items Section */}
            {!localQuery && selectedCategory === 'all' && popularProductsWithStock.length > 0 && (
                <div className="px-4 py-3 bg-[#eef2ff]/60 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <div className="w-1 h-4 bg-[#0056b3] rounded-full" />
                        <h3 className="text-xs font-bold text-[#0056b3] dark:text-blue-400 uppercase tracking-wider">Fast moving items</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {popularProductsWithStock.map(p => (
                            <button
                                key={p.id}
                                onClick={() => p.stockLevel > 0 && addToCart(p)}
                                disabled={p.stockLevel <= 0}
                                className={`flex flex-col items-center p-2 rounded-[10px] border transition-all ${p.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700' : 'bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 hover:border-[#0056b3]/35 hover:shadow-sm active:scale-95'}`}
                            >
                                <div className="w-10 h-10 rounded-[8px] bg-[#eef2ff] dark:bg-slate-700/80 flex items-center justify-center mb-1 overflow-hidden">
                                    {p.imageUrl ? (
                                        <CachedImage path={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-[#0056b3]/40 dark:text-slate-500">
                                            {React.cloneElement(ICONS.package as any, { size: 16 })}
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate w-full text-center">{p.name}</span>
                            </button>
                        ))}
                    </div>
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
                    >
                        {ProductRow}
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
                                    onClick={() => setIsAddSkuModalOpen(true)}
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

            <AddOrEditSkuModal
                isOpen={isAddSkuModalOpen}
                onClose={() => setIsAddSkuModalOpen(false)}
                initialSkuOrBarcode={localQuery.trim()}
                onItemReady={(item) => {
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
