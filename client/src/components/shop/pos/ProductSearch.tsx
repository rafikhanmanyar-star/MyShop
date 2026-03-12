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

function mapApiProductToPOS(p: any): POSProduct {
    return {
        id: p.id,
        sku: p.sku || 'N/A',
        barcode: p.barcode || '',
        name: p.name,
        price: Number(p.retail_price) || Number(p.price) || 0,
        cost: Number(p.cost_price) || 0,
        categoryId: p.category_id || 'others',
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

const ProductSearch: React.FC = () => {
    const {
        addToCart,
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        isDenseMode,
        isHeldSalesModalOpen,
        isPaymentModalOpen,
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
    const [isAddSkuModalOpen, setIsAddSkuModalOpen] = useState(false);

    // Internal search state for debouncing
    const [localQuery, setLocalQuery] = useState(searchQuery);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<FixedSizeList>(null);
    const categoryContainerRef = useRef<HTMLDivElement>(null);

    const scrollCategories = (direction: 'left' | 'right') => {
        if (categoryContainerRef.current) {
            const scrollAmount = 250;
            categoryContainerRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

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

    // Keep focus on search input
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                if (!isHeldSalesModalOpen && !isPaymentModalOpen && !isCustomerModalOpen && !isSalesHistoryModalOpen) {
                    // Only focus if no other modal is open (checking some global states if possible)
                }
                searchInputRef.current?.focus();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, []);

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
            keys: ['name', 'sku', 'barcode', 'categoryId'],
            threshold: 0.3,
            distance: 100,
            ignoreLocation: true,
        });
    }, [productsWithStock]);

    const filteredProducts = useMemo(() => {
        let result = productsWithStock;

        // Category Filter
        if (selectedCategory !== 'all') {
            result = result.filter(p => {
                if (p.categoryId === selectedCategory) return true;
                const cat = shopCategories.find(c => c.id === selectedCategory);
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
    }, [productsWithStock, selectedCategory, localQuery, fuse, shopCategories]);

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

    const ProductRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const rowItems: any[] = [];
        const cellClass = columnCount === 2 ? 'flex-[0_0_50%] min-w-0 max-w-[50%]' : 'flex-[0_0_33.333%] min-w-0 max-w-[33.333%]';
        for (let i = 0; i < columnCount; i++) {
            const itemIndex = index * columnCount + i;
            if (itemIndex < filteredProducts.length) {
                const product = filteredProducts[itemIndex];
                const isSelected = keyboardIndex === itemIndex;
                rowItems.push(
                    <div key={product.id} className={`p-2 ${cellClass}`}>
                        <button
                            onClick={() => product.stockLevel > 0 && addToCart(product)}
                            disabled={product.stockLevel <= 0}
                            className={`group w-full h-full min-h-0 relative flex flex-col p-3 bg-white border rounded-2xl text-left transition-all overflow-hidden ${product.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed border-slate-100' : 'hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 active:scale-95'} ${isSelected ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-100'
                                }`}
                        >
                            <div className={`w-full flex-shrink-0 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-50 overflow-hidden relative ${isDenseMode ? 'aspect-video max-h-[72px]' : 'aspect-square'}`}>
                                {product.imageUrl ? (
                                    <CachedImage path={product.imageUrl} alt={product.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="text-slate-200">
                                        {React.cloneElement(ICONS.package as any, { size: isDenseMode ? 24 : 40 })}
                                    </div>
                                )}
                                {product.stockLevel <= (product.reorderPoint || 10) && (
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-rose-500 text-white rounded text-[8px] font-bold uppercase tracking-wider shadow-sm">
                                        {product.stockLevel <= 0 ? 'Out of Stock' : 'Low Stock'}
                                    </div>
                                )}
                            </div>

                            <div className={`flex-shrink-0 font-bold text-slate-800 line-clamp-2 leading-tight mt-2 min-h-0 ${isDenseMode ? 'text-[11px] h-[1.75rem]' : 'text-[13px] h-[2.5rem]'}`}>
                                {product.name}
                            </div>

                            <div className="flex flex-shrink-0 items-center justify-between mt-1">
                                <span className={`font-black text-blue-600 truncate ${isDenseMode ? 'text-xs' : 'text-sm'}`}>
                                    {CURRENCY}{product.price.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">
                                    Qty: {product.stockLevel}
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
        <div className="flex flex-col h-full bg-white relative">
            {/* Search Bar - Premium Fixed Header */}
            <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 p-4">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                        {React.cloneElement(ICONS.search as any, { size: 18 })}
                    </div>
                    <input
                        ref={searchInputRef}
                        id="pos-product-search"
                        type="text"
                        className="w-full pl-11 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all"
                        placeholder="Search Products (Ctrl+F)"
                        value={localQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                        {localQuery && (
                            <button onClick={() => handleSearchChange('')} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
                                {React.cloneElement(ICONS.x as any, { size: 14 })}
                            </button>
                        )}
                        <span className="kbd-tag bg-white shadow-sm border-slate-200">F4</span>
                    </div>
                </div>

                {/* Categories - Scalable Redesign */}
                <div className="mt-4 flex items-center gap-2 relative">
                    <button
                        onClick={() => scrollCategories('left')}
                        className="flex-shrink-0 p-2 rounded-xl border bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm z-10"
                    >
                        {React.cloneElement(ICONS.chevronLeft as any, { size: 16 })}
                    </button>

                    <div ref={categoryContainerRef} className="flex-1 flex gap-2 overflow-x-auto pos-scrollbar pb-2 pt-1 px-1 scroll-smooth">
                        <button
                            onClick={() => setSelectedCategory('all')}
                            className={`whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedCategory === 'all' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            All Products
                        </button>
                        {shopCategories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedCategory === cat.id ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => scrollCategories('right')}
                        className="flex-shrink-0 p-2 rounded-xl border bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm z-10"
                    >
                        {React.cloneElement(ICONS.chevronRight as any, { size: 16 })}
                    </button>
                </div>
            </div>

            {/* Popular / Frequent Items Section */}
            {!localQuery && selectedCategory === 'all' && popularProducts.length > 0 && (
                <div className="px-4 py-3 bg-indigo-50/50 border-b border-indigo-100/50">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                        <h3 className="text-[11px] font-black text-indigo-900 uppercase tracking-wider">Fast Moving Items</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {popularProducts.map(p => (
                            <button
                                key={p.id}
                                onClick={() => p.stockLevel > 0 && addToCart(p)}
                                disabled={p.stockLevel <= 0}
                                className={`flex flex-col items-center p-2 rounded-xl border transition-all ${p.stockLevel <= 0 ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-100' : 'bg-white border-indigo-100 hover:border-indigo-400 hover:shadow-md active:scale-95'}`}
                            >
                                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-1 overflow-hidden">
                                    {p.imageUrl ? (
                                        <CachedImage path={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-indigo-200">
                                            {React.cloneElement(ICONS.package as any, { size: 16 })}
                                        </div>
                                    )}
                                </div>
                                <span className="text-[9px] font-bold text-slate-700 truncate w-full text-center">{p.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Product Grid - Virtualized */}
            <div ref={gridContainerRef} className="flex-1 overflow-hidden pointer-events-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
                        <div className="w-10 h-10 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Loading Catalog...</span>
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
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-200">
                            {React.cloneElement(ICONS.search as any, { size: 32 })}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">No products found</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
                            {localQuery.trim()
                                ? 'Add this SKU/barcode to inventory or search for an existing one to edit.'
                                : 'Try adjusting your search query or category filters'}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                            {localQuery.trim() && (
                                <button
                                    onClick={() => setIsAddSkuModalOpen(true)}
                                    className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2"
                                >
                                    {React.cloneElement(ICONS.plus as any, { size: 14 })}
                                    Add SKU to inventory
                                </button>
                            )}
                            <button
                                onClick={() => { setLocalQuery(''); setSearchQuery(''); setSelectedCategory('all'); }}
                                className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-800 transition-all shadow-lg"
                            >
                                Reset Catalog
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Status / Mode Toggle */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-500">Items: <span className="text-slate-900">{filteredProducts.length}</span></span>
                </div>
                {/* Dense Mode Toggle is handled by ShortcutBar, but we can add minor UI here if needed */}
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
