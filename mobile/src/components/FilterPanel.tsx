import { useState, useEffect, useRef, useCallback, type TouchEvent } from 'react';

const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'price_low_high', label: 'Price: Low → High' },
    { value: 'price_high_low', label: 'Price: High → Low' },
    { value: 'newest', label: 'Newest' },
    { value: 'popularity', label: 'Popular' },
    { value: 'best_selling', label: 'Best selling' },
    { value: 'top_rated', label: 'Highest rated' },
    { value: 'a_z', label: 'Name A–Z' },
    { value: 'z_a', label: 'Name Z–A' },
];

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    categories: any[];
    brands: any[];
    filters: any;
    onApply: (newFilters: Record<string, unknown>) => void;
    onClear: () => void;
}

export default function FilterPanel({
    isOpen,
    onClose,
    categories,
    brands,
    filters,
    onApply,
    onClear,
}: FilterPanelProps) {
    const [localFilters, setLocalFilters] = useState(filters);
    const [categorySearch, setCategorySearch] = useState('');
    const [brandSearch, setBrandSearch] = useState('');
    const touchStartX = useRef<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalFilters(filters);
            setCategorySearch('');
            setBrandSearch('');
        }
    }, [isOpen, filters]);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const toggleMultiSelect = (key: string, value: string) => {
        setLocalFilters((prev: Record<string, unknown>) => {
            const current = (prev[key] as string[]) || [];
            if (current.includes(value)) {
                return { ...prev, [key]: current.filter((v: string) => v !== value) };
            }
            return { ...prev, [key]: [...current, value] };
        });
    };

    const setAvailabilityMode = (mode: 'any' | 'in_stock' | 'out_of_stock' | 'pre_order') => {
        setLocalFilters((prev: Record<string, unknown>) => {
            const next = { ...prev } as Record<string, unknown>;
            if (mode === 'any') {
                delete next.availability;
                next.filterInStock = false;
            } else if (mode === 'in_stock') {
                next.filterInStock = true;
                delete next.availability;
            } else if (mode === 'out_of_stock') {
                next.filterInStock = false;
                next.availability = 'out_of_stock';
            } else {
                next.filterInStock = false;
                next.availability = 'pre_order';
            }
            return next;
        });
    };

    const availabilityMode = (): 'any' | 'in_stock' | 'out_of_stock' | 'pre_order' => {
        const a = localFilters.availability as string | undefined;
        if (a === 'out_of_stock') return 'out_of_stock';
        if (a === 'pre_order') return 'pre_order';
        if (localFilters.filterInStock) return 'in_stock';
        return 'any';
    };

    const onTouchStart = useCallback((e: TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    }, []);

    const onTouchEnd = useCallback(
        (e: TouchEvent) => {
            if (touchStartX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (dx < -56) onClose();
        },
        [onClose]
    );

    const handleApply = () => {
        onApply(localFilters);
        onClose();
    };

    const handleReset = () => {
        onClear();
        onClose();
    };

    if (!isOpen) return null;

    const filteredCategories = categories.filter(
        (c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()) && !c.parent_id
    );

    const filteredSubcategories = categories.filter(
        (c) =>
            c.name.toLowerCase().includes(categorySearch.toLowerCase()) &&
            (localFilters.categoryIds as string[] | undefined)?.includes(c.parent_id)
    );

    const filteredBrands = brands.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()));

    const mode = availabilityMode();

    return (
        <div className="filter-drawer-overlay" role="presentation" onClick={onClose}>
            <aside
                ref={panelRef}
                className="filter-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="filter-drawer-title"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div className="filter-drawer-header">
                    <h2 id="filter-drawer-title">Filters</h2>
                    <button type="button" className="filter-drawer-close" onClick={onClose} aria-label="Close filters">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="filter-drawer-body">
                    <div className="filter-section">
                        <h3>Sort by</h3>
                        <div className="filter-sort-list" role="list">
                            {SORT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="listitem"
                                    className={`filter-sort-option ${localFilters.sortBy === opt.value ? 'active' : ''}`}
                                    onClick={() => setLocalFilters({ ...localFilters, sortBy: opt.value })}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <h3>Price range</h3>
                        <div className="price-inputs">
                            <div className="price-input-wrap">
                                <span>Rs.</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="Min"
                                    value={(localFilters.minPrice as string) || ''}
                                    onChange={(e) => setLocalFilters({ ...localFilters, minPrice: e.target.value })}
                                />
                            </div>
                            <div className="filter-drawer-dash">—</div>
                            <div className="price-input-wrap">
                                <span>Rs.</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="Max"
                                    value={(localFilters.maxPrice as string) || ''}
                                    onChange={(e) => setLocalFilters({ ...localFilters, maxPrice: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="filter-section">
                        <h3>Categories</h3>
                        <input
                            type="search"
                            className="search-mini"
                            placeholder="Search categories…"
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                        />
                        <div className="filter-grid filter-grid--scroll">
                            {filteredCategories.map((c) => (
                                <label
                                    key={c.id}
                                    className={`filter-checkbox ${(localFilters.categoryIds as string[])?.includes(c.id) ? 'active' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={(localFilters.categoryIds as string[])?.includes(c.id) ?? false}
                                        onChange={() => toggleMultiSelect('categoryIds', c.id)}
                                    />
                                    {c.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    {filteredSubcategories.length > 0 && (
                        <div className="filter-section">
                            <h3>Subcategories</h3>
                            <div className="filter-grid">
                                {filteredSubcategories.map((c) => (
                                    <label
                                        key={c.id}
                                        className={`filter-checkbox ${(localFilters.subcategoryIds as string[])?.includes(c.id) ? 'active' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={(localFilters.subcategoryIds as string[])?.includes(c.id) ?? false}
                                            onChange={() => toggleMultiSelect('subcategoryIds', c.id)}
                                        />
                                        {c.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="filter-section">
                        <h3>Brands</h3>
                        <input
                            type="search"
                            className="search-mini"
                            placeholder="Search brands…"
                            value={brandSearch}
                            onChange={(e) => setBrandSearch(e.target.value)}
                        />
                        <div className="filter-grid filter-grid--scroll">
                            {filteredBrands.map((b) => (
                                <label
                                    key={b.id}
                                    className={`filter-checkbox ${(localFilters.brandIds as string[])?.includes(b.id) ? 'active' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={(localFilters.brandIds as string[])?.includes(b.id) ?? false}
                                        onChange={() => toggleMultiSelect('brandIds', b.id)}
                                    />
                                    {b.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <h3>Availability</h3>
                        <div className="filter-toggle-row">
                            <span>In stock</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mode === 'in_stock' ? 'true' : 'false'}
                                aria-label="In stock only"
                                title="In stock only"
                                className={`filter-switch ${mode === 'in_stock' ? 'on' : ''}`}
                                onClick={() => setAvailabilityMode(mode === 'in_stock' ? 'any' : 'in_stock')}
                            />
                        </div>
                        <div className="filter-toggle-row">
                            <span>Out of stock</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mode === 'out_of_stock' ? 'true' : 'false'}
                                aria-label="Out of stock only"
                                title="Out of stock only"
                                className={`filter-switch ${mode === 'out_of_stock' ? 'on' : ''}`}
                                onClick={() => setAvailabilityMode(mode === 'out_of_stock' ? 'any' : 'out_of_stock')}
                            />
                        </div>
                        <div className="filter-toggle-row">
                            <span>Pre-order</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mode === 'pre_order' ? 'true' : 'false'}
                                aria-label="Pre-order only"
                                title="Pre-order only"
                                className={`filter-switch ${mode === 'pre_order' ? 'on' : ''}`}
                                onClick={() => setAvailabilityMode(mode === 'pre_order' ? 'any' : 'pre_order')}
                            />
                        </div>
                    </div>

                    <div className="filter-section">
                        <h3>Offers &amp; more</h3>
                        <label
                            className={`filter-checkbox filter-checkbox--full ${localFilters.onSale ? 'active' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={localFilters.onSale === true}
                                onChange={(e) => setLocalFilters({ ...localFilters, onSale: e.target.checked })}
                            />
                            On sale / deals
                        </label>
                        <div className="filter-toggle-row">
                            <span>Popular picks</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={localFilters.filterPopular ? 'true' : 'false'}
                                aria-label="Popular picks"
                                title="Popular picks"
                                className={`filter-switch ${localFilters.filterPopular ? 'on' : ''}`}
                                onClick={() =>
                                    setLocalFilters({ ...localFilters, filterPopular: !localFilters.filterPopular })
                                }
                            />
                        </div>
                        <div className="filter-toggle-row">
                            <span>Low price</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={localFilters.filterLowPrice ? 'true' : 'false'}
                                aria-label="Low price"
                                title="Low price"
                                className={`filter-switch ${localFilters.filterLowPrice ? 'on' : ''}`}
                                onClick={() =>
                                    setLocalFilters((prev: Record<string, unknown>) => ({
                                        ...prev,
                                        filterLowPrice: !prev.filterLowPrice,
                                        lowPriceMax: !prev.filterLowPrice
                                            ? prev.lowPriceMax || '500'
                                            : prev.lowPriceMax,
                                    }))
                                }
                            />
                        </div>
                        {localFilters.filterLowPrice && (
                            <div className="price-input-wrap price-input-wrap--spaced">
                                <span>Max Rs.</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="500"
                                    value={(localFilters.lowPriceMax as string) || ''}
                                    onChange={(e) => setLocalFilters({ ...localFilters, lowPriceMax: e.target.value })}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="filter-drawer-footer">
                    <button type="button" className="btn btn-outline btn-full" onClick={handleReset}>
                        Reset
                    </button>
                    <button type="button" className="btn btn-primary btn-full" onClick={handleApply}>
                        Apply filters
                    </button>
                </div>
            </aside>
        </div>
    );
}
