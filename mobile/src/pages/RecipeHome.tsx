import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api';
import RecipeCard, { type RecipeCardData } from '../components/RecipeCard';
import { recipeFeedCacheGet, recipeFeedCacheSet } from '../utils/recipeFeedCache';

/** Server clamps recipe list to 60 max */
const BROWSE_LIMIT = 60;

type CategoryRow = { id: string; name: string; image_url?: string | null };

type BrowseSection = { key: string; title: string; items: RecipeCardData[] };

function buildBrowseSections(
    items: RecipeCardData[],
    categories: CategoryRow[],
    filterCatId: string
): BrowseSection[] {
    if (filterCatId) {
        const cat = categories.find((c) => c.id === filterCatId);
        const title = cat?.name || items[0]?.category_name || 'Recipes';
        return items.length ? [{ key: filterCatId, title, items }] : [];
    }

    const nameById = new Map(categories.map((c) => [c.id, c.name] as const));
    const buckets = new Map<string | null, RecipeCardData[]>();
    for (const r of items) {
        const cid = r.category_id ?? null;
        if (!buckets.has(cid)) buckets.set(cid, []);
        buckets.get(cid)!.push(r);
    }

    const out: BrowseSection[] = [];
    const used = new Set<string | null>();

    for (const c of categories) {
        const list = buckets.get(c.id);
        if (list?.length) {
            out.push({ key: c.id, title: c.name, items: list });
            used.add(c.id);
        }
    }

    const unc = buckets.get(null);
    if (unc?.length) {
        out.push({ key: 'uncat', title: 'Other recipes', items: unc });
        used.add(null);
    }

    for (const [cid, list] of buckets) {
        if (!list.length || used.has(cid)) continue;
        if (cid) {
            const title = nameById.get(cid) || list[0]?.category_name || 'Recipes';
            out.push({ key: cid, title, items: list });
        }
    }

    return out;
}

export default function RecipeHome() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const q = (searchParams.get('q') || '').trim();

    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [catFilter, setCatFilter] = useState<string>('');

    const [browseItems, setBrowseItems] = useState<RecipeCardData[]>([]);
    const [searchItems, setSearchItems] = useState<RecipeCardData[]>([]);

    const [browseLoading, setBrowseLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);

    const loadBrowse = useCallback(async () => {
        if (!shopSlug) return [];
        const cacheKey = `${shopSlug}:browse:${catFilter || 'all'}`;
        const hit = recipeFeedCacheGet<RecipeCardData[]>(cacheKey);
        if (hit) return hit;
        const data = await publicApi.getRecipes(shopSlug, {
            limit: BROWSE_LIMIT,
            offset: 0,
            ...(catFilter ? { category_id: catFilter } : {}),
        });
        const items = (data.items || []) as RecipeCardData[];
        recipeFeedCacheSet(cacheKey, items);
        return items;
    }, [shopSlug, catFilter]);

    useEffect(() => {
        if (!shopSlug || q) return;
        let cancelled = false;
        (async () => {
            setBrowseLoading(true);
            try {
                const [cats, items] = await Promise.all([
                    publicApi.getRecipeCategories(shopSlug).catch(() => []),
                    loadBrowse(),
                ]);
                if (cancelled) return;
                setCategories(Array.isArray(cats) ? cats : []);
                setBrowseItems(items);
            } catch {
                if (!cancelled) {
                    setCategories([]);
                    setBrowseItems([]);
                }
            } finally {
                if (!cancelled) setBrowseLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shopSlug, q, loadBrowse]);

    useEffect(() => {
        if (!shopSlug || !q) {
            setSearchItems([]);
            setSearchLoading(false);
            return;
        }
        let cancelled = false;
        setSearchLoading(true);
        const t = window.setTimeout(() => {
            publicApi
                .getRecipes(shopSlug, { search: q, limit: 30, offset: 0, category_id: catFilter || undefined })
                .then((data) => {
                    if (!cancelled) setSearchItems((data.items || []) as RecipeCardData[]);
                })
                .catch(() => {
                    if (!cancelled) setSearchItems([]);
                })
                .finally(() => {
                    if (!cancelled) setSearchLoading(false);
                });
        }, 280);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [shopSlug, q, catFilter]);

    const onSearch = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const v = String(fd.get('q') || '').trim();
        setSearchParams(v ? { q: v } : {});
    };

    if (!shopSlug) return null;

    const filt = (items: RecipeCardData[]) =>
        !catFilter ? items : items.filter((r) => r.category_id === catFilter);

    const renderListSection = (title: string, items: RecipeCardData[]) => {
        if (!items.length) return null;
        return (
            <section className="recipe-section">
                <div className="recipe-section__head">
                    <h2 className="recipe-section__title">{title}</h2>
                </div>
                <ul className="recipe-list" role="list">
                    {items.map((r) => (
                        <li key={r.id} className="recipe-list__item">
                            <RecipeCard recipe={r} shopSlug={shopSlug} />
                        </li>
                    ))}
                </ul>
            </section>
        );
    };

    const browseSections = buildBrowseSections(browseItems, categories, catFilter);
    const hasBrowse = browseSections.some((s) => s.items.length > 0);

    return (
        <div className="recipe-page fade-in">
            <header style={{ marginBottom: 12 }}>
                <Link
                    to={`/${shopSlug}`}
                    style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}
                >
                    ← Back to shop
                </Link>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 0' }}>Recipes</h1>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Cook at home — we&apos;ll pack the ingredients.
                </p>
            </header>

            <form className="recipe-search-bar" onSubmit={onSearch}>
                <input name="q" type="search" placeholder="Search title, cuisine, ingredients…" defaultValue={q} />
                <button type="submit" className="recipe-btn-primary" style={{ padding: '10px 16px' }}>
                    Search
                </button>
            </form>

            <div className="recipe-cat-rail" aria-label="Recipe categories">
                <button
                    type="button"
                    className={`recipe-cat-chip${!catFilter ? ' recipe-cat-chip--on' : ''}`}
                    onClick={() => setCatFilter('')}
                >
                    All
                </button>
                {categories.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        className={`recipe-cat-chip${catFilter === c.id ? ' recipe-cat-chip--on' : ''}`}
                        onClick={() => setCatFilter(c.id === catFilter ? '' : c.id)}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {q && (
                <section className="recipe-section">
                    <div className="recipe-section__head">
                        <h2 className="recipe-section__title">Results for &ldquo;{q}&rdquo;</h2>
                    </div>
                    {searchLoading ? (
                        <p style={{ color: 'var(--text-muted)' }}>Searching…</p>
                    ) : filt(searchItems).length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>No recipes match.</p>
                    ) : (
                        <ul className="recipe-list" role="list">
                            {filt(searchItems).map((r) => (
                                <li key={r.id} className="recipe-list__item">
                                    <RecipeCard recipe={r} shopSlug={shopSlug} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {!q && (
                <>
                    {browseLoading ? (
                        <p style={{ color: 'var(--text-muted)' }}>Loading recipes…</p>
                    ) : (
                        <>
                            {browseSections.map((sec) => renderListSection(sec.title, sec.items))}
                            {!browseLoading && !hasBrowse && (
                                <p style={{ color: 'var(--text-muted)' }}>
                                    {catFilter
                                        ? 'No recipes in this category. Try another filter.'
                                        : 'No recipes yet. Your shop can add them from the POS.'}
                                </p>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
