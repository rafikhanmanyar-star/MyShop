import { useState, useEffect, useRef, useCallback, useMemo, type TouchEvent } from 'react';

type CategoryRow = { id: string; name?: string; parent_id?: string | null; parentId?: string | null };

function parentIdOf(c: CategoryRow): string | null {
    const p = c.parent_id ?? c.parentId;
    return p == null || p === '' ? null : String(p);
}

function normalizeCategoryFilters(
    f: Record<string, unknown>,
    allCategories: CategoryRow[],
): Record<string, unknown> {
    const mains = new Set(allCategories.filter((c) => !parentIdOf(c)).map((c) => c.id));
    const catIds = (f.categoryIds as string[]) || [];
    const subIds = (f.subcategoryIds as string[]) || [];

    let main = catIds.find((id) => mains.has(id)) || '';
    if (!main && subIds[0]) {
        const sub = allCategories.find((c) => c.id === subIds[0]);
        const sp = sub ? parentIdOf(sub) : null;
        if (sp && mains.has(sp)) main = sp;
    }

    const subs = subIds.filter((sid) => {
        const s = allCategories.find((c) => c.id === sid);
        return Boolean(main && s && parentIdOf(s) === main);
    });

    return {
        ...f,
        categoryIds: main ? [main] : [],
        subcategoryIds: subs[0] ? [subs[0]] : [],
    };
}

/** Primary sort choices shown in the filter drawer (matches product browse reference). */
const FILTER_SORT_PILLS: { value: string; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'popularity', label: 'Popular' },
    { value: 'price_low_high', label: 'Price: Low to High' },
    { value: 'price_high_low', label: 'Price: High to Low' },
];

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    categories: CategoryRow[];
    brands: { id: string; name: string }[];
    filters: Record<string, unknown>;
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
    const [brandSearch, setBrandSearch] = useState('');
    const touchStartX = useRef<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalFilters(normalizeCategoryFilters(filters, categories));
            setBrandSearch('');
        }
    }, [isOpen, filters, categories]);

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

    const mainCategories = useMemo(
        () =>
            [...categories.filter((c) => !parentIdOf(c))].sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
            ),
        [categories],
    );

    const selectedMainCategoryId = (localFilters.categoryIds as string[] | undefined)?.[0] || '';

    const subcategoriesForMain = useMemo(() => {
        if (!selectedMainCategoryId) return [];
        return [...categories.filter((c) => parentIdOf(c) === selectedMainCategoryId)].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
        );
    }, [categories, selectedMainCategoryId]);

    const selectedSubcategoryId = (localFilters.subcategoryIds as string[] | undefined)?.[0] || '';

    if (!isOpen) return null;

    const filteredBrands = brands.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()));

    const subSelectValue = subcategoriesForMain.some((s) => s.id === selectedSubcategoryId)
        ? selectedSubcategoryId
        : '';

    return (
        <div className="filter-drawer-overlay" role="presentation" onClick={onClose}>
            <aside
                ref={panelRef}
                className="filter-drawer filter-drawer--reference"
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
                        <div className="filter-section-heading">
                            <span className="filter-section-icon" aria-hidden>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 6h16M4 12h10M4 18h6" />
                                </svg>
                            </span>
                            <h3>Sort by</h3>
                        </div>
                        <div className="filter-sort-pills" role="list">
                            {FILTER_SORT_PILLS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="listitem"
                                    className={`filter-sort-pill ${localFilters.sortBy === opt.value ? 'active' : ''}`}
                                    onClick={() => setLocalFilters({ ...localFilters, sortBy: opt.value })}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <div className="filter-section-heading">
                            <span className="filter-section-icon" aria-hidden>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="2" y="6" width="20" height="12" rx="2" />
                                    <path d="M6 10h.01M10 10h.01" />
                                </svg>
                            </span>
                            <h3>Price range</h3>
                        </div>
                        <div className="price-inputs price-inputs--filter-drawer">
                            <input
                                type="number"
                                inputMode="decimal"
                                className="filter-price-input"
                                placeholder="$ Min"
                                aria-label="Minimum price"
                                value={(localFilters.minPrice as string) || ''}
                                onChange={(e) => setLocalFilters({ ...localFilters, minPrice: e.target.value })}
                            />
                            <span className="filter-drawer-dash" aria-hidden>
                                —
                            </span>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="filter-price-input"
                                placeholder="$ Max"
                                aria-label="Maximum price"
                                value={(localFilters.maxPrice as string) || ''}
                                onChange={(e) => setLocalFilters({ ...localFilters, maxPrice: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="filter-section">
                        <div className="filter-section-heading">
                            <span className="filter-section-icon" aria-hidden>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                                    <path d="M2 17 12 22l10-5" />
                                    <path d="M2 12 12 17l10-5" />
                                </svg>
                            </span>
                            <h3>Categories</h3>
                        </div>
                        <label className="visually-hidden" htmlFor="filter-main-category">
                            Main category
                        </label>
                        <select
                            id="filter-main-category"
                            className="filter-select filter-select--soft"
                            value={selectedMainCategoryId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setLocalFilters((prev: Record<string, unknown>) => ({
                                    ...prev,
                                    categoryIds: id ? [id] : [],
                                    subcategoryIds: [],
                                }));
                            }}
                        >
                            <option value="">All Categories</option>
                            {mainCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-section">
                        <div className="filter-section-heading">
                            <span className="filter-section-icon" aria-hidden>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4v6a2 2 0 0 0 2 2h4" />
                                    <path d="M4 4h4M10 10v8" />
                                </svg>
                            </span>
                            <h3>Sub-categories</h3>
                        </div>
                        <label className="visually-hidden" htmlFor="filter-subcategory">
                            Subcategory
                        </label>
                        <select
                            id="filter-subcategory"
                            className="filter-select filter-select--soft"
                            disabled={!selectedMainCategoryId}
                            value={selectedMainCategoryId ? subSelectValue : ''}
                            onChange={(e) => {
                                const id = e.target.value;
                                setLocalFilters((prev: Record<string, unknown>) => ({
                                    ...prev,
                                    subcategoryIds: id ? [id] : [],
                                }));
                            }}
                        >
                            <option value="">
                                {selectedMainCategoryId ? 'All Sub-categories' : 'Select a category first'}
                            </option>
                            {subcategoriesForMain.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-section">
                        <div className="filter-section-heading">
                            <span className="filter-section-icon filter-section-icon--badge" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            </span>
                            <h3>Brands</h3>
                        </div>
                        <div className="filter-brand-search-wrap">
                            <svg
                                className="filter-brand-search-icon"
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                            >
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                            <input
                                type="search"
                                className="filter-brand-search"
                                placeholder="Search brands…"
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                            />
                        </div>
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
                </div>

                <div className="filter-drawer-footer filter-drawer-footer--reference">
                    <button type="button" className="btn btn-filter-reset" onClick={handleReset}>
                        Reset
                    </button>
                    <button type="button" className="btn btn-filter-apply" onClick={handleApply}>
                        Apply filters
                    </button>
                </div>
            </aside>
        </div>
    );
}
