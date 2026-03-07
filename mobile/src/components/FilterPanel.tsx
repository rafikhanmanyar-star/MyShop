import { useState, useEffect } from 'react';

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    categories: any[];
    brands: any[];
    filters: any;
    onApply: (newFilters: any) => void;
    onClear: () => void;
}

export default function FilterPanel({
    isOpen,
    onClose,
    categories,
    brands,
    filters,
    onApply,
    onClear
}: FilterPanelProps) {
    const [localFilters, setLocalFilters] = useState(filters);
    const [categorySearch, setCategorySearch] = useState('');
    const [brandSearch, setBrandSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLocalFilters(filters);
        }
    }, [isOpen, filters]);

    if (!isOpen) return null;

    const toggleMultiSelect = (key: string, value: string) => {
        setLocalFilters((prev: any) => {
            const current = prev[key] || [];
            if (current.includes(value)) {
                return { ...prev, [key]: current.filter((v: string) => v !== value) };
            } else {
                return { ...prev, [key]: [...current, value] };
            }
        });
    };

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(categorySearch.toLowerCase()) && !c.parent_id
    );

    const filteredSubcategories = categories.filter(c =>
        c.name.toLowerCase().includes(categorySearch.toLowerCase()) &&
        localFilters.categoryIds?.includes(c.parent_id)
    );

    const filteredBrands = brands.filter(b =>
        b.name.toLowerCase().includes(brandSearch.toLowerCase())
    );

    return (
        <div className="bottom-sheet-overlay" onClick={onClose}>
            <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-header">
                    <h2>Filter & Sort</h2>
                    <button onClick={onClose}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Price Range */}
                <div className="filter-section">
                    <h3>Price Range</h3>
                    <div className="price-inputs">
                        <div className="price-input-wrap">
                            <span>Rs.</span>
                            <input
                                type="number"
                                placeholder="Min"
                                value={localFilters.minPrice || ''}
                                onChange={e => setLocalFilters({ ...localFilters, minPrice: e.target.value })}
                                onWheel={(e) => e.preventDefault()}
                            />
                        </div>
                        <div style={{ color: '#94A3B8' }}>—</div>
                        <div className="price-input-wrap">
                            <span>Rs.</span>
                            <input
                                type="number"
                                placeholder="Max"
                                value={localFilters.maxPrice || ''}
                                onChange={e => setLocalFilters({ ...localFilters, maxPrice: e.target.value })}
                                onWheel={(e) => e.preventDefault()}
                            />
                        </div>
                    </div>
                </div>

                {/* Categories */}
                <div className="filter-section">
                    <h3>Categories</h3>
                    <input
                        type="text"
                        className="search-mini"
                        placeholder="Search categories..."
                        value={categorySearch}
                        onChange={e => setCategorySearch(e.target.value)}
                    />
                    <div className="filter-grid">
                        {filteredCategories.map(c => (
                            <label key={c.id} className={`filter-checkbox ${localFilters.categoryIds?.includes(c.id) ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={localFilters.categoryIds?.includes(c.id)}
                                    onChange={() => toggleMultiSelect('categoryIds', c.id)}
                                />
                                {c.name}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Subcategories (Dynamic) */}
                {filteredSubcategories.length > 0 && (
                    <div className="filter-section">
                        <h3>Subcategories</h3>
                        <div className="filter-grid">
                            {filteredSubcategories.map(c => (
                                <label key={c.id} className={`filter-checkbox ${localFilters.subcategoryIds?.includes(c.id) ? 'active' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={localFilters.subcategoryIds?.includes(c.id)}
                                        onChange={() => toggleMultiSelect('subcategoryIds', c.id)}
                                    />
                                    {c.name}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Brands */}
                <div className="filter-section">
                    <h3>Brands</h3>
                    <input
                        type="text"
                        className="search-mini"
                        placeholder="Search brands..."
                        value={brandSearch}
                        onChange={e => setBrandSearch(e.target.value)}
                    />
                    <div className="filter-grid">
                        {filteredBrands.map(b => (
                            <label key={b.id} className={`filter-checkbox ${localFilters.brandIds?.includes(b.id) ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={localFilters.brandIds?.includes(b.id)}
                                    onChange={() => toggleMultiSelect('brandIds', b.id)}
                                />
                                {b.name}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Availability */}
                <div className="filter-section">
                    <h3>Availability</h3>
                    <div className="filter-grid">
                        <label className={`filter-checkbox ${localFilters.availability === 'in_stock' ? 'active' : ''}`}>
                            <input type="radio" name="availability" onChange={() => setLocalFilters({ ...localFilters, availability: 'in_stock' })} />
                            In Stock
                        </label>
                        <label className={`filter-checkbox ${localFilters.availability === 'out_of_stock' ? 'active' : ''}`}>
                            <input type="radio" name="availability" onChange={() => setLocalFilters({ ...localFilters, availability: 'out_of_stock' })} />
                            Out of Stock
                        </label>
                        <label className={`filter-checkbox ${localFilters.availability === 'pre_order' ? 'active' : ''}`}>
                            <input type="radio" name="availability" onChange={() => setLocalFilters({ ...localFilters, availability: 'pre_order' })} />
                            Pre-order
                        </label>
                    </div>
                </div>

                {/* Offers */}
                <div className="filter-section">
                    <h3>Offers</h3>
                    <label className={`filter-checkbox ${localFilters.onSale ? 'active' : ''}`} style={{ width: '100%', marginBottom: 8 }}>
                        <input type="checkbox" checked={localFilters.onSale === true} onChange={e => setLocalFilters({ ...localFilters, onSale: e.target.checked })} />
                        On Sale Only
                    </label>
                </div>

                <div className="bottom-sheet-footer">
                    <button className="btn btn-outline btn-full" onClick={onClear}>Clear All</button>
                    <button className="btn btn-primary btn-full" onClick={() => { onApply(localFilters); onClose(); }}>Apply Filters</button>
                </div>
            </div>
        </div>
    );
}
