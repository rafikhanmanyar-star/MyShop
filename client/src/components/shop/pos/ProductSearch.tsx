import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSProduct } from '../../../types/pos';
import { InventoryItem } from '../../../types/inventory';
import { shopApi, ShopProductCategory } from '../../../services/shopApi';
import { getFullImageUrl } from '../../../config/apiUrl';

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
        imageUrl: getFullImageUrl(p.image_url)
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
        imageUrl: item.imageUrl
    };
}

const ProductSearch: React.FC = () => {
    const { addToCart, searchQuery, setSearchQuery } = usePOS();
    const { items: inventoryItems } = useInventory();
    const inventoryItemsRef = useRef(inventoryItems);
    inventoryItemsRef.current = inventoryItems;

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const loadShopCategories = useCallback(async () => {
        try {
            const list = await shopApi.getShopCategories();
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

    useEffect(() => {
        loadProducts();
        loadShopCategories();
    }, [loadProducts, loadShopCategories]);

    // Keep focus on search input for barcode scanner
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                searchInputRef.current?.focus();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const categoryTabs = useMemo(() => {
        const all: { id: string; name: string }[] = [{ id: 'all', name: 'All' }];
        const cats = (shopCategories || []).map(c => ({ id: c.id, name: c.name }));
        return [...all, ...cats];
    }, [shopCategories]);

    const matchesCategory = useCallback((p: POSProduct) => {
        if (selectedCategory === 'all') return true;
        if (p.categoryId === selectedCategory) return true;
        const cat = shopCategories.find(c => c.id === selectedCategory);
        return cat ? p.categoryId === cat.name : false;
    }, [selectedCategory, shopCategories]);

    const filteredProducts = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return products.filter(p => matchesCategory(p));

        return products.filter(p => {
            const barcode = (p.barcode || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();

            if (barcode === query) return true;
            if (barcode.includes(query)) return true;

            const matchesOther = name.includes(query) ||
                sku.includes(query) ||
                (p.categoryId && p.categoryId.toLowerCase().includes(query)) ||
                p.price.toString().includes(query) ||
                p.unit.toLowerCase().includes(query);

            return matchesOther && matchesCategory(p);
        }).sort((a, b) => {
            const aBarcode = (a.barcode || '').toLowerCase();
            const bBarcode = (b.barcode || '').toLowerCase();

            if (aBarcode === query && bBarcode !== query) return -1;
            if (bBarcode === query && aBarcode !== query) return 1;

            const aPartial = aBarcode.includes(query);
            const bPartial = bBarcode.includes(query);
            if (aPartial && !bPartial) return -1;
            if (bPartial && !aPartial) return 1;

            return a.name.localeCompare(b.name);
        });
    }, [searchQuery, selectedCategory, products, matchesCategory]);

    // Handle barcode "instant add"
    useEffect(() => {
        const query = searchQuery.trim();
        if (!query || query.length < 3) return;

        const exactMatch = products.find(p => p.barcode && p.barcode.toLowerCase() === query.toLowerCase());
        if (exactMatch) {
            addToCart(exactMatch);
        }
    }, [searchQuery, addToCart, products]);

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Search Bar Area */}
            <div className="p-5 border-b border-slate-100">
                <div className="relative group/search">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within/search:text-blue-600 transition-colors">
                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 20 })}
                    </div>
                    <input
                        ref={searchInputRef}
                        id="pos-product-search"
                        type="text"
                        className="block w-full pl-12 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        placeholder="Search products or scan barcode..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-4 flex items-center">
                        <kbd className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-400 shadow-sm">F4</kbd>
                    </div>
                </div>

                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto mt-4 no-scrollbar">
                    {categoryTabs.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-semibold transition-all ${selectedCategory === cat.id
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-5 pos-scrollbar bg-slate-50/30">
                <div className="grid grid-cols-2 gap-4">
                    {loadError && (
                        <div className="col-span-full p-8 rounded-2xl bg-rose-50 border border-rose-100 text-center">
                            <h3 className="text-sm font-bold text-rose-900 mb-2">Failed to load products</h3>
                            <button
                                onClick={() => loadProducts()}
                                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors"
                            >
                                Retry Connection
                            </button>
                        </div>
                    )}

                    {isLoading && Array(8).fill(0).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 animate-pulse">
                            <div className="aspect-square bg-slate-100 rounded-xl mb-3"></div>
                            <div className="h-4 bg-slate-100 rounded-full w-3/4 mb-2"></div>
                            <div className="h-4 bg-slate-100 rounded-full w-1/2"></div>
                        </div>
                    ))}

                    {!isLoading && filteredProducts.map(product => (
                        <button
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="group relative flex flex-col p-4 bg-white border border-slate-100 rounded-2xl text-left transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 active:scale-[0.98]"
                        >
                            <div className="mb-3 w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center border border-slate-50 overflow-hidden relative">
                                {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500" />
                                ) : (
                                    <div className="text-slate-200 group-hover:text-blue-300 transition-colors">
                                        {React.cloneElement(ICONS.package as React.ReactElement, { size: 40 })}
                                    </div>
                                )}

                                {product.stockLevel < 5 && (
                                    <div className="absolute top-2 right-2 px-2 py-1 bg-rose-500 text-white rounded-md text-[9px] font-bold uppercase tracking-wider shadow-sm">
                                        Low Stock
                                    </div>
                                )}
                            </div>

                            <div className="text-[14px] font-semibold text-slate-900 line-clamp-2 leading-tight mb-2 min-h-[2.5rem] group-hover:text-blue-600 transition-colors">
                                {product.name}
                            </div>

                            <div className="flex items-center justify-between mt-auto">
                                <span className="text-base font-bold text-slate-900">
                                    {CURRENCY}{product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <div className={`px-2 py-1 rounded-md text-[10px] font-bold ${product.stockLevel < 10 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'}`}>
                                    Qty: {product.stockLevel}
                                </div>
                            </div>

                            {/* Quick Add Indicator */}
                            <div className="absolute bottom-4 right-4 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg shadow-blue-500/40">
                                {React.cloneElement(ICONS.plus as React.ReactElement, { size: 16 })}
                            </div>
                        </button>
                    ))}

                    {!isLoading && filteredProducts.length === 0 && (
                        <div className="col-span-full py-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                {React.cloneElement(ICONS.search as React.ReactElement, { size: 32 })}
                            </div>
                            <h3 className="text-base font-semibold text-slate-900 mb-1">No products found</h3>
                            <p className="text-sm text-slate-500 mb-6">Try searching for something else</p>
                            <button
                                onClick={() => setSearchQuery('')}
                                className="px-6 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
                            >
                                Clear Search
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductSearch;
