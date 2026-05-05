import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { publicApi, customerApi, getFullImageUrl } from '../api';
import { useApp, type CartItem } from '../context/AppContext';
import CachedImage from '../components/CachedImage';

type IngredientRow = {
    ingredient_name: string;
    quantity: number | string;
    unit: string;
    optional: boolean;
    product_name?: string;
    product_id: string;
};

export default function RecipeDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, showToast } = useApp();

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState(false);
    const [cartBusy, setCartBusy] = useState(false);
    const [servings, setServings] = useState(1);

    const load = useCallback(async () => {
        if (!shopSlug || !id) return;
        setLoading(true);
        setErr('');
        try {
            const d = await publicApi.getRecipe(shopSlug, id);
            setData(d);
            const s = Number(d?.recipe?.servings) || 1;
            setServings(s);
        } catch (e: any) {
            setErr(e?.message || 'Could not load recipe');
        } finally {
            setLoading(false);
        }
    }, [shopSlug, id]);

    useEffect(() => {
        void load();
    }, [load]);

    const recipe = data?.recipe;
    const ingredients: IngredientRow[] = data?.ingredients || [];
    const steps: { step_number: number; instruction: string; image_url?: string | null }[] = data?.steps || [];
    const saved = !!data?.saved;

    const mergeGeneratedIntoCart = useCallback(
        async (goCart: boolean) => {
            if (!shopSlug || !id) return;
            setCartBusy(true);
            try {
                const gen = await publicApi.generateRecipeCart(shopSlug, id, { servings });
                const rows = gen.items || [];
                if (!rows.length) {
                    showToast('No items to add');
                    return;
                }
                const lines = rows.map(
                    (row: any) =>
                        ({
                            productId: row.product_id,
                            name: row.product_name,
                            sku: String(row.sku || ''),
                            price: Number(row.price) || 0,
                            quantity: Number(row.quantity) || 1,
                            image_url: row.image_url || undefined,
                            available_stock: Number(row.available_stock ?? 0),
                            tax_rate: Number(row.tax_rate) || 0,
                        }) as CartItem
                );
                dispatch({ type: 'MERGE_RECIPE_CART_ITEMS', lines });
                showToast(goCart ? 'Ingredients added — opening cart' : 'Ingredients added to cart');
                if (goCart) navigate(`/${shopSlug}/cart`);
            } catch (e: any) {
                showToast(e?.message || 'Could not add to cart');
            } finally {
                setCartBusy(false);
            }
        },
        [shopSlug, id, servings, dispatch, navigate, showToast]
    );

    const toggleSave = async () => {
        if (!shopSlug || !id) return;
        if (!state.isLoggedIn) {
            showToast('Sign in to save recipes');
            navigate(`/${shopSlug}/login?redirect=recipes/${id}`);
            return;
        }
        setSaving(true);
        try {
            if (saved) {
                await customerApi.unsaveRecipe(shopSlug, id);
                setData((d: any) => (d ? { ...d, saved: false } : d));
                showToast('Removed from saved');
            } else {
                await customerApi.saveRecipe(shopSlug, id);
                setData((d: any) => (d ? { ...d, saved: true } : d));
                showToast('Recipe saved');
            }
        } catch (e: any) {
            showToast(e?.message || 'Could not update');
        } finally {
            setSaving(false);
        }
    };

    if (!shopSlug) return null;

    if (loading) {
        return (
            <div className="recipe-page">
                <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            </div>
        );
    }
    if (err || !recipe) {
        return (
            <div className="recipe-page">
                <p style={{ color: '#b91c1c' }}>{err || 'Not found'}</p>
                <Link to={`/${shopSlug}/recipes`}>← Recipes</Link>
            </div>
        );
    }

    return (
        <div className="recipe-page fade-in">
            <div className="recipe-detail-hero">
                <CachedImage
                    path={recipe.image_url || undefined}
                    alt=""
                    loading="eager"
                    fallbackLabel={recipe.title}
                    fallbackClassName="recipe-card__img-fallback"
                    style={{ width: '100%', height: '100%' }}
                />
            </div>

            <Link to={`/${shopSlug}/recipes`} style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                ← All recipes
            </Link>

            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '12px 0 8px', lineHeight: 1.2 }}>{recipe.title}</h1>

            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Serves {recipe.servings ?? 1}
                {recipe.prep_time_minutes != null || recipe.cook_time_minutes != null ? (
                    <>
                        {' '}
                        · Prep {recipe.prep_time_minutes ?? 0}m · Cook {recipe.cook_time_minutes ?? 0}m
                    </>
                ) : null}
                {recipe.difficulty ? ` · ${recipe.difficulty}` : ''}
            </p>

            <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Portions (scale cart)
                </label>
                <input
                    type="number"
                    min={1}
                    max={99}
                    value={servings}
                    onChange={(e) => setServings(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    aria-label="Number of servings for ingredient quantities"
                    style={{
                        width: 100,
                        padding: 10,
                        borderRadius: 10,
                        border: '1px solid var(--border, #e5e7eb)',
                        fontSize: 16,
                    }}
                />
            </div>

            {recipe.description && (
                <p style={{ fontSize: 15, lineHeight: 1.55, marginTop: 16, color: 'var(--text)' }}>{recipe.description}</p>
            )}

            {recipe.video_url && (
                <a
                    href={recipe.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="recipe-video-cta"
                    aria-label={`Watch recipe video (${recipe.title})`}
                >
                    <span className="recipe-video-cta__icon" aria-hidden>
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
                            <path d="M8 5v14l11-7L8 5z" />
                        </svg>
                    </span>
                    Watch video →
                </a>
            )}

            <div className="recipe-detail-actions">
                <button
                    type="button"
                    className="recipe-btn-secondary"
                    disabled={saving}
                    onClick={() => void toggleSave()}
                >
                    {saved ? 'Saved ✓' : 'Save recipe'}
                </button>
                <button
                    type="button"
                    className="recipe-btn-secondary"
                    disabled={cartBusy}
                    onClick={() => void mergeGeneratedIntoCart(false)}
                >
                    Add ingredients to cart
                </button>
                <button
                    type="button"
                    className="recipe-btn-primary"
                    disabled={cartBusy}
                    onClick={() => void mergeGeneratedIntoCart(true)}
                >
                    Cook this — go to cart
                </button>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>Ingredients</h2>
            <ul className="recipe-ing-list">
                {ingredients.map((ing) => (
                    <li key={`${ing.product_id}-${ing.ingredient_name}`}>
                        <strong>{ing.ingredient_name}</strong>
                        {ing.quantity != null && ing.quantity !== '' ? ` — ${ing.quantity} ${ing.unit || ''}`.trim() : ''}
                        {ing.optional ? <span style={{ color: 'var(--text-muted)' }}> (optional)</span> : null}
                        {ing.product_name ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                                → {ing.product_name}
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>

            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>Steps</h2>
            <div className="recipe-steps">
                {steps.map((st) => (
                    <div key={st.step_number} className="recipe-step">
                        <div>
                            <p>{st.instruction}</p>
                            {st.image_url ? (
                                <img
                                    src={getFullImageUrl(st.image_url) || st.image_url}
                                    alt=""
                                    style={{ maxWidth: '100%', borderRadius: 12, marginTop: 8 }}
                                    loading="lazy"
                                />
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
