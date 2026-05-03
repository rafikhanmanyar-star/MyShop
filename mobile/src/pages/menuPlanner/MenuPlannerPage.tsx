import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { menuPlannerApi, publicApi, getFullImageUrl } from '../../api';

const GREEN = '#2E7D32';

type RecipeRow = {
    id: string;
    title: string;
    description?: string | null;
    image_url?: string | null;
    calories?: number | null;
    prep_time_minutes?: number;
    cook_time_minutes?: number;
    category_name?: string | null;
};

type CustomerRow = {
    id: string;
    name: string;
    description?: string | null;
    image_url?: string | null;
    ingredient_count?: number;
};

export type MenuPlannerPageProps = {
    shopSlug: string;
    embedded?: boolean;
    contentBottomPad?: string;
};

export default function MenuPlannerPage({ shopSlug, embedded = false, contentBottomPad }: MenuPlannerPageProps) {
    const { state, showToast } = useApp();
    const bottomPad = contentBottomPad ?? 'calc(72px + var(--safe-bottom) + 24px)';

    const [search, setSearch] = useState('');
    const [recipes, setRecipes] = useState<RecipeRow[]>([]);
    const [recipeTotal, setRecipeTotal] = useState(0);
    const [recipesLoading, setRecipesLoading] = useState(false);
    const [customerItems, setCustomerItems] = useState<CustomerRow[]>([]);
    const [customerLoading, setCustomerLoading] = useState(false);

    const [sheetOpen, setSheetOpen] = useState(false);
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formImageFile, setFormImageFile] = useState<File | null>(null);
    const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
    const [formIngredients, setFormIngredients] = useState<{ name: string; qty: string; unit: string }[]>([
        { name: '', qty: '1', unit: '' },
    ]);
    const [saving, setSaving] = useState(false);

    const loadCustomer = useCallback(async () => {
        if (!shopSlug || !state.isLoggedIn) return;
        setCustomerLoading(true);
        try {
            const r = (await menuPlannerApi.listCustomerMenuItems(shopSlug)) as { items?: CustomerRow[] };
            setCustomerItems(Array.isArray(r?.items) ? r.items : []);
        } catch (e: any) {
            showToast(e?.message || 'Could not load your items');
        } finally {
            setCustomerLoading(false);
        }
    }, [shopSlug, state.isLoggedIn, showToast]);

    useEffect(() => {
        void loadCustomer();
    }, [loadCustomer]);

    useEffect(() => {
        void (async () => {
            if (!shopSlug) return;
            setRecipesLoading(true);
            try {
                const q = search.trim();
                const data = (await publicApi.getRecipes(shopSlug, {
                    search: q || undefined,
                    limit: 15,
                    offset: 0,
                })) as { items?: RecipeRow[]; total?: number };
                const rows = Array.isArray(data?.items) ? data.items : [];
                setRecipeTotal(Number(data?.total ?? rows.length));
                setRecipes(rows);
            } catch {
                setRecipes([]);
                setRecipeTotal(0);
            } finally {
                setRecipesLoading(false);
            }
        })();
    }, [shopSlug, search]);

    const loadMoreRecipes = async () => {
        if (!shopSlug || recipesLoading) return;
        const next = recipes.length;
        if (next >= recipeTotal) return;
        setRecipesLoading(true);
        try {
            const q = search.trim();
            const data = (await publicApi.getRecipes(shopSlug, {
                search: q || undefined,
                limit: 15,
                offset: next,
            })) as { items?: RecipeRow[]; total?: number };
            const rows = Array.isArray(data?.items) ? data.items : [];
            setRecipeTotal(Number(data?.total ?? next + rows.length));
            setRecipes((prev) => [...prev, ...rows]);
        } catch {
            /* ignore */
        } finally {
            setRecipesLoading(false);
        }
    };

    const openCreate = () => {
        setFormName('');
        setFormDesc('');
        setFormImageFile(null);
        if (formImagePreview) URL.revokeObjectURL(formImagePreview);
        setFormImagePreview(null);
        setFormIngredients([{ name: '', qty: '1', unit: '' }]);
        setSheetOpen(true);
    };

    const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFormImageFile(f);
        if (formImagePreview) URL.revokeObjectURL(formImagePreview);
        setFormImagePreview(URL.createObjectURL(f));
    };

    const saveCustomerItem = async () => {
        if (!shopSlug) return;
        const name = formName.trim();
        if (!name) {
            showToast('Enter a name');
            return;
        }
        const ingredients = formIngredients
            .map((r) => ({
                ingredient_name: r.name.trim(),
                quantity: parseFloat(r.qty) || 1,
                unit: r.unit.trim(),
            }))
            .filter((r) => r.ingredient_name.length > 0);
        if (ingredients.length === 0) {
            showToast('Add at least one ingredient');
            return;
        }
        setSaving(true);
        try {
            let image_url: string | null = null;
            if (formImageFile) {
                const up = await publicApi.uploadImage(shopSlug, formImageFile);
                image_url = (up as { imageUrl?: string })?.imageUrl ?? null;
            }
            await menuPlannerApi.createCustomerMenuItem(shopSlug, {
                name,
                description: formDesc.trim() || null,
                image_url,
                ingredients,
            });
            showToast('Saved to My items');
            setSheetOpen(false);
            await loadCustomer();
        } catch (e: any) {
            showToast(e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const removeCustomerItem = async (id: string, label: string) => {
        if (!shopSlug || !window.confirm(`Remove “${label}” from your library?`)) return;
        try {
            await menuPlannerApi.deleteCustomerMenuItem(shopSlug, id);
            showToast('Removed');
            await loadCustomer();
        } catch (e: any) {
            showToast(e?.message || 'Could not remove');
        }
    };

    if (!state.isLoggedIn) {
        return (
            <div style={{ padding: 24, paddingBottom: 120 }}>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Sign in to manage your menu library.</p>
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: bottomPad, background: '#F5F5F7' }}>
            <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
                {!embedded && (
                    <Link to={`/${shopSlug}/my-menu?tab=dashboard`} style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>
                        ← Dashboard
                    </Link>
                )}

                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.45 }}>
                    Browse shop recipes and items you create here. Open the <strong>Calendar</strong> tab, tap + on a meal
                    slot, and pick either a catalog recipe or one of your items—ingredients flow into the shopping list.
                </p>

                <div style={{ marginTop: 20 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: '#1A1A1A' }}>Shop recipes</h2>
                    <div style={{ marginTop: 8, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>
                            🔍
                        </span>
                        <input
                            className="input"
                            placeholder="Search recipes…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: 36, borderRadius: 12, height: 44, width: '100%' }}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {recipes.map((r) => {
                        const img = getFullImageUrl(r.image_url);
                        const mins = (r.prep_time_minutes || 0) + (r.cook_time_minutes || 0);
                        return (
                            <div
                                key={r.id}
                                className="card"
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 12,
                                    border: '1px solid var(--border-light)',
                                    background: '#fff',
                                }}
                            >
                                <div
                                    style={{
                                        width: 64,
                                        height: 64,
                                        borderRadius: 10,
                                        flexShrink: 0,
                                        background: img ? `url(${img}) center/cover` : '#E0E0E0',
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {r.category_name && (
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#1565C0', marginBottom: 4 }}>
                                            {String(r.category_name).toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ fontWeight: 800, fontSize: 15 }}>{r.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                        {mins ? `${mins} min` : '—'}
                                        {r.calories ? ` · ${r.calories} kcal` : ''}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {recipesLoading && <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 12 }}>Loading…</p>}
                {!recipesLoading && recipes.length < recipeTotal && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: '100%', marginTop: 12 }}
                        onClick={() => void loadMoreRecipes()}
                    >
                        Load more recipes
                    </button>
                )}

                <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#1A1A1A' }}>My items</h2>
                    <button
                        type="button"
                        onClick={openCreate}
                        style={{
                            background: GREEN,
                            color: '#fff',
                            border: 'none',
                            borderRadius: 999,
                            padding: '8px 14px',
                            fontWeight: 700,
                            fontSize: 13,
                        }}
                    >
                        + New item
                    </button>
                </div>

                {customerLoading && (
                    <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Loading your items…</p>
                )}
                {!customerLoading && customerItems.length === 0 && (
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.45 }}>
                        No custom items yet. Create one with a photo, description, and ingredients so it can power your
                        shopping list when you add it on the calendar.
                    </p>
                )}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {customerItems.map((c) => {
                        const img = getFullImageUrl(c.image_url);
                        return (
                            <div
                                key={c.id}
                                className="card"
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 12,
                                    border: '1px solid rgba(46,125,50,0.35)',
                                    background: '#fff',
                                }}
                            >
                                <div
                                    style={{
                                        width: 64,
                                        height: 64,
                                        borderRadius: 10,
                                        flexShrink: 0,
                                        background: img ? `url(${img}) center/cover` : '#E8F5E9',
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, marginBottom: 4 }}>YOUR ITEM</div>
                                    <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                        {Number(c.ingredient_count ?? 0)} ingredient
                                        {Number(c.ingredient_count ?? 0) === 1 ? '' : 's'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Delete item"
                                    onClick={() => void removeCustomerItem(c.id, c.name)}
                                    style={{ border: 'none', background: 'transparent', color: '#999', fontSize: 20, alignSelf: 'start' }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {sheetOpen && (
                <div
                    className="bottom-sheet-overlay"
                    style={{ zIndex: 2000 }}
                    role="presentation"
                    onClick={() => !saving && setSheetOpen(false)}
                >
                    <div
                        className="bottom-sheet"
                        role="dialog"
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: 20, maxHeight: '90dvh', overflow: 'auto' }}
                    >
                        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>New my item</h3>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Photo</label>
                        <input type="file" accept="image/*" aria-label="Upload dish photo" onChange={onPickImage} style={{ marginBottom: 12 }} />
                        {formImagePreview && (
                            <div
                                style={{
                                    width: '100%',
                                    height: 140,
                                    borderRadius: 12,
                                    background: `url(${formImagePreview}) center/cover`,
                                    marginBottom: 16,
                                }}
                            />
                        )}
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Name</label>
                        <input
                            className="input"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            style={{ width: '100%', marginBottom: 12 }}
                        />
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Description</label>
                        <textarea
                            className="input"
                            value={formDesc}
                            onChange={(e) => setFormDesc(e.target.value)}
                            rows={3}
                            style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Ingredients</label>
                            <button
                                type="button"
                                onClick={() => setFormIngredients((p) => [...p, { name: '', qty: '1', unit: '' }])}
                                style={{ border: 'none', background: 'none', color: GREEN, fontWeight: 700, fontSize: 13 }}
                            >
                                + Add line
                            </button>
                        </div>
                        {formIngredients.map((row, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                <input
                                    className="input"
                                    placeholder="e.g. Tomatoes"
                                    value={row.name}
                                    onChange={(e) =>
                                        setFormIngredients((p) =>
                                            p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                                        )
                                    }
                                    style={{ flex: 1 }}
                                />
                                <input
                                    className="input"
                                    placeholder="Qty"
                                    value={row.qty}
                                    onChange={(e) =>
                                        setFormIngredients((p) =>
                                            p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x))
                                        )
                                    }
                                    style={{ width: 56 }}
                                />
                                <input
                                    className="input"
                                    placeholder="Unit"
                                    value={row.unit}
                                    onChange={(e) =>
                                        setFormIngredients((p) =>
                                            p.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x))
                                        )
                                    }
                                    style={{ width: 72 }}
                                />
                                {formIngredients.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setFormIngredients((p) => p.filter((_, j) => j !== i))}
                                        style={{ border: 'none', background: 'transparent', color: '#999' }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={saving}
                            style={{ width: '100%', background: GREEN, marginTop: 8 }}
                            onClick={() => void saveCustomerItem()}
                        >
                            {saving ? 'Saving…' : 'Save item'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
