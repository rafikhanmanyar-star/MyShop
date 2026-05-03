import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api';
import RecipeCard, { type RecipeCardData } from '../components/RecipeCard';
import { recipeFeedCacheGet, recipeFeedCacheSet } from '../utils/recipeFeedCache';

type SectionKey = 'featured' | 'quick' | 'budget' | 'trending';

function sectionParams(key: SectionKey): Record<string, string | number> {
    const base = { limit: 12, offset: 0 };
    if (key === 'featured') return { ...base, featured: 'true' };
    if (key === 'quick') return { ...base, quick: 'true' };
    if (key === 'budget') return { ...base, budget: 'true' };
    return { ...base, trending: 'true' };
}

export default function RecipeHome() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const q = (searchParams.get('q') || '').trim();

    const [categories, setCategories] = useState<{ id: string; name: string; image_url?: string | null }[]>([]);
    const [catFilter, setCatFilter] = useState<string>('');

    const [featured, setFeatured] = useState<RecipeCardData[]>([]);
    const [quick, setQuick] = useState<RecipeCardData[]>([]);
    const [budget, setBudget] = useState<RecipeCardData[]>([]);
    const [trending, setTrending] = useState<RecipeCardData[]>([]);
    const [searchItems, setSearchItems] = useState<RecipeCardData[]>([]);

    const [loading, setLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);

    const loadSection = useCallback(
        async (key: SectionKey): Promise<RecipeCardData[]> => {
            if (!shopSlug) return [];
            const cacheKey = `${shopSlug}:sec:${key}`;
            const hit = recipeFeedCacheGet<RecipeCardData[]>(cacheKey);
            if (hit) return hit;
            const data = await publicApi.getRecipes(shopSlug, sectionParams(key));
            const items = (data.items || []) as RecipeCardData[];
            recipeFeedCacheSet(cacheKey, items);
            return items;
        },
        [shopSlug]
    );

    useEffect(() => {
        if (!shopSlug) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [cats, f, qu, bu, tr] = await Promise.all([
                    publicApi.getRecipeCategories(shopSlug).catch(() => []),
                    loadSection('featured'),
                    loadSection('quick'),
                    loadSection('budget'),
                    loadSection('trending'),
                ]);
                if (cancelled) return;
                setCategories(Array.isArray(cats) ? cats : []);
                setFeatured(f);
                setQuick(qu);
                setBudget(bu);
                setTrending(tr);
            } catch {
                if (!cancelled) {
                    setFeatured([]);
                    setQuick([]);
                    setBudget([]);
                    setTrending([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shopSlug, loadSection]);

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

    const renderRow = (title: string, items: RecipeCardData[]) => {
        const rows = filt(items);
        if (!rows.length) return null;
        return (
            <section className="recipe-section">
                <div className="recipe-section__head">
                    <h2 className="recipe-section__title">{title}</h2>
                </div>
                <div className="recipe-row">
                    {rows.map((r) => (
                        <div key={r.id} className="recipe-row__cell">
                            <RecipeCard recipe={r} shopSlug={shopSlug} />
                        </div>
                    ))}
                </div>
            </section>
        );
    };

    const hasSectionItems =
        filt(featured).length + filt(quick).length + filt(budget).length + filt(trending).length > 0;

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
                        <div className="recipe-row">
                            {filt(searchItems).map((r) => (
                                <div key={r.id} className="recipe-row__cell">
                                    <RecipeCard recipe={r} shopSlug={shopSlug} />
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {!q && (
                <>
                    {loading ? (
                        <p style={{ color: 'var(--text-muted)' }}>Loading recipes…</p>
                    ) : (
                        <>
                            {renderRow('Featured', featured)}
                            {renderRow('Quick meals', quick)}
                            {renderRow('Budget meals', budget)}
                            {renderRow('Trending', trending)}
                            {!loading && !hasSectionItems && (
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
