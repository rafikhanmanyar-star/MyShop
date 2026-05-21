import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ICONS } from '../../../constants';

export type CatalogFilterId = 'all' | 'fast' | 'recent' | 'favorites' | 'promotions' | 'low-stock';

const FILTER_CHIPS: { id: CatalogFilterId; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'fast', label: 'Fast moving' },
    { id: 'recent', label: 'Recent' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'promotions', label: 'Promotions' },
    { id: 'low-stock', label: 'Low stock' },
];

const POS_RECENT_SEARCHES_KEY = 'pos-recent-searches';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem(POS_RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
    } catch {
        return [];
    }
}

function saveRecentSearch(query: string) {
    const q = query.trim();
    if (!q || q.length < 2) return;
    try {
        const prev = loadRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase());
        const next = [q, ...prev].slice(0, MAX_RECENT_SEARCHES);
        localStorage.setItem(POS_RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
}

type ProductCatalogHeaderProps = {
    localQuery: string;
    onQueryChange: (value: string) => void;
    activeFilter: CatalogFilterId;
    onFilterChange: (filter: CatalogFilterId) => void;
    searchInputRef: React.RefObject<HTMLInputElement>;
    showFastMovingStrip: boolean;
    onToggleFastMovingStrip?: () => void;
};

export default function ProductCatalogHeader({
    localQuery,
    onQueryChange,
    activeFilter,
    onFilterChange,
    searchInputRef,
    showFastMovingStrip,
    onToggleFastMovingStrip,
}: ProductCatalogHeaderProps) {
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setRecentSearches(loadRecentSearches());
    }, [localQuery]);

    useEffect(() => {
        const onDocDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setSuggestionsOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    const commitSearch = useCallback(
        (q: string) => {
            onQueryChange(q);
            saveRecentSearch(q);
            setRecentSearches(loadRecentSearches());
            setSuggestionsOpen(false);
        },
        [onQueryChange]
    );

    const showSuggestions = suggestionsOpen && !localQuery && recentSearches.length > 0;

    return (
        <div
            ref={wrapperRef}
            className="sticky top-0 z-30 shrink-0 border-b border-slate-200/80 bg-white/95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none"
        >
            <div className="relative px-4 pb-2 pt-3">
                <div className="relative group">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400 transition-colors group-focus-within:text-blue-600 dark:text-slate-500 dark:group-focus-within:text-blue-400">
                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 20 })}
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 left-11 flex items-center text-slate-300 dark:text-slate-600" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M3 7v10M7 7v10M10 7v10M14 7v10M17 7v10M21 7v10" />
                        </svg>
                    </div>
                    <input
                        ref={searchInputRef}
                        id="pos-product-search"
                        type="search"
                        autoComplete="off"
                        className="w-full rounded-2xl border border-slate-200/90 bg-slate-50 py-3.5 pl-[4.25rem] pr-24 text-[15px] font-medium text-slate-900 placeholder-slate-400 transition-all select-text focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-700"
                        placeholder="Search or scan barcode… (F1)"
                        value={localQuery}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onFocus={() => setSuggestionsOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && localQuery.trim()) {
                                saveRecentSearch(localQuery);
                                setSuggestionsOpen(false);
                            }
                        }}
                        aria-expanded={showSuggestions}
                        aria-controls="pos-search-suggestions"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                        {localQuery ? (
                            <button
                                type="button"
                                onClick={() => onQueryChange('')}
                                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-600 dark:hover:text-slate-200"
                                aria-label="Clear search"
                            >
                                {React.cloneElement(ICONS.x as React.ReactElement, { size: 16 })}
                            </button>
                        ) : null}
                        <span className="kbd-tag">F1</span>
                    </div>
                </div>

                {showSuggestions ? (
                    <ul
                        id="pos-search-suggestions"
                        role="listbox"
                        className="absolute left-4 right-4 top-[calc(100%-4px)] z-40 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                    >
                        <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Recent searches
                        </li>
                        {recentSearches.map((term) => (
                            <li key={term}>
                                <button
                                    type="button"
                                    role="option"
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/80"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => commitSearch(term)}
                                >
                                    {term}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>

            <div className="pos-filter-chips-scroll flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
                {FILTER_CHIPS.map((chip) => {
                    const active = activeFilter === chip.id;
                    return (
                        <button
                            key={chip.id}
                            type="button"
                            onClick={() => onFilterChange(chip.id)}
                            className={[
                                'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all',
                                active
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                    : 'border border-slate-200/90 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500/50',
                            ].join(' ')}
                            aria-pressed={active}
                        >
                            {chip.label}
                        </button>
                    );
                })}
                {onToggleFastMovingStrip ? (
                    <button
                        type="button"
                        onClick={onToggleFastMovingStrip}
                        className="shrink-0 rounded-full border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400"
                        title={showFastMovingStrip ? 'Hide quick picks row' : 'Show quick picks row'}
                    >
                        {showFastMovingStrip ? 'Hide picks' : 'Show picks'}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export { saveRecentSearch, POS_RECENT_SEARCHES_KEY };
