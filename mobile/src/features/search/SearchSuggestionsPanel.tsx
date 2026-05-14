import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../../api';

function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

function highlight(text: string, q: string) {
    const t = q.trim();
    if (!t) return <>{text}</>;
    const low = text.toLowerCase();
    const i = low.indexOf(t.toLowerCase());
    if (i < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, i)}
            <mark className="search-suggest-highlight">{text.slice(i, i + t.length)}</mark>
            {text.slice(i + t.length)}
        </>
    );
}

export type SuggestionPick =
    | { kind: 'product'; id: string; label: string }
    | { kind: 'brand'; id: string; label: string }
    | { kind: 'category'; id: string; label: string }
    | { kind: 'trending' | 'recent'; label: string };

type Section = {
    type: string;
    title: string;
    items: { id: string; label: string; subtitle?: string; meta?: Record<string, unknown> }[];
};

export function SearchSuggestionsPanel({
    shopSlug,
    query,
    open,
    recent,
    onPick,
}: {
    shopSlug: string;
    query: string;
    open: boolean;
    recent: string[];
    onPick: (p: SuggestionPick) => void;
}) {
    const debounced = useDebounced(query, 250);
    const enabled = open && debounced.trim().length >= 2;

    const { data, isFetching } = useQuery({
        queryKey: ['searchSuggestions', shopSlug, debounced, recent],
        queryFn: () => publicApi.getSearchSuggestions(shopSlug, { q: debounced.trim(), recent }),
        enabled,
    });

    if (!open) return null;

    if (debounced.trim().length < 2) {
        return (
            <div className="search-suggestions search-suggestions--empty" role="listbox">
                <p className="search-suggestions__hint">Type at least 2 characters for instant results</p>
            </div>
        );
    }

    const sections: Section[] = (data?.sections as Section[]) || [];

    return (
        <div className="search-suggestions" role="listbox" aria-busy={isFetching}>
            {isFetching && !sections.length ? (
                <div className="search-suggestions__loading">Searching…</div>
            ) : null}
            {sections.map((sec) => (
                <div key={sec.type + sec.title} className="search-suggestions__section">
                    <div className="search-suggestions__section-title">{sec.title}</div>
                    <ul className="search-suggestions__list">
                        {sec.items.map((it) => (
                            <li key={it.id}>
                                <button
                                    type="button"
                                    className="search-suggestions__row"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        if (sec.type === 'product')
                                            onPick({ kind: 'product', id: it.meta?.productId ? String(it.meta.productId) : it.id, label: it.label });
                                        else if (sec.type === 'brand')
                                            onPick({ kind: 'brand', id: String(it.meta?.brandId || it.id), label: it.label });
                                        else if (sec.type === 'category')
                                            onPick({ kind: 'category', id: String(it.meta?.categoryId || it.id), label: it.label });
                                        else if (sec.type === 'trending') onPick({ kind: 'trending', label: it.label });
                                        else onPick({ kind: 'recent', label: it.label });
                                    }}
                                >
                                    <span className="search-suggestions__label">{highlight(it.label, debounced)}</span>
                                    {it.subtitle ? <span className="search-suggestions__sub">{it.subtitle}</span> : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            {!isFetching && sections.length === 0 ? (
                <div className="search-suggestions__empty">No matches yet — try another spelling</div>
            ) : null}
        </div>
    );
}
