import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useApp } from '../../context/AppContext';
import { publicApi, menuPlannerApi, getFullImageUrl } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';
import MyMenuTabStrip, { buildMyMenuHubPath } from '../../components/menuPlanner/MyMenuTabStrip';
import type { MyMenuTab } from '../../context/MyMenuLayoutContext';

const GREEN = '#2E7D32';

type RecipeCategoryRow = { id: string; name: string; image_url?: string | null };

function parseReturnTab(s: string | null): MyMenuTab {
    if (s === 'configure') return 'planner';
    if (s === 'planner' || s === 'calendar' || s === 'dashboard' || s === 'shopping') return s;
    return 'calendar';
}

export default function RecipePickerPage() {
    const { shopSlug, menuId: routeMenuId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showToast, state } = useApp();

    const menuId = routeMenuId || searchParams.get('menuId') || '';
    const returnTab = parseReturnTab(searchParams.get('returnTab'));
    const fromMyMenuPick = Boolean(!routeMenuId && searchParams.get('menuId'));

    const day = Number(searchParams.get('day') || '0');
    const mealType = searchParams.get('mealType') || 'lunch';

    const [search, setSearch] = useState('');
    const [activeCategoryId, setActiveCategoryId] = useState('');
    const [categories, setCategories] = useState<RecipeCategoryRow[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selectedMy, setSelectedMy] = useState<Set<string>>(new Set());
    const [myItems, setMyItems] = useState<{ id: string; name: string; image_url?: string | null }[]>([]);
    const parentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!shopSlug) return;
        let cancelled = false;
        void (async () => {
            try {
                const cats = await publicApi.getRecipeCategories(shopSlug).catch(() => []);
                if (!cancelled) setCategories(Array.isArray(cats) ? cats : []);
            } catch {
                if (!cancelled) setCategories([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shopSlug]);

    useEffect(() => {
        if (!shopSlug || !state.isLoggedIn) {
            setMyItems([]);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const r = (await menuPlannerApi.listCustomerMenuItems(shopSlug)) as { items?: { id: string; name: string; image_url?: string | null }[] };
                if (!cancelled) setMyItems(Array.isArray(r?.items) ? r.items : []);
            } catch {
                if (!cancelled) setMyItems([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shopSlug, state.isLoggedIn]);

    const load = useCallback(
        async (nextOffset: number, append: boolean, searchQuery?: string) => {
            if (!shopSlug) return;
            setLoading(true);
            try {
                const raw = searchQuery !== undefined ? searchQuery : search;
                const q = raw.trim();
                const data = await publicApi.getRecipes(shopSlug, {
                    search: q || undefined,
                    limit: 20,
                    offset: nextOffset,
                    ...(activeCategoryId ? { category_id: activeCategoryId } : {}),
                });
                const rows = (data as any)?.items || [];
                setTotal(Number((data as any)?.total ?? rows.length + nextOffset));
                if (append) setItems((prev) => [...prev, ...rows]);
                else setItems(rows);
                setOffset(nextOffset);
            } catch (e) {
                console.warn(e);
            } finally {
                setLoading(false);
            }
        },
        [shopSlug, activeCategoryId, search]
    );

    useEffect(() => {
        setItems([]);
        void load(0, false);
    }, [load]);

    const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 340,
        overscan: 3,
    });

    const toggle = (id: string) => {
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    };

    const toggleMy = (id: string) => {
        setSelectedMy((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    };

    const confirm = async () => {
        if (!shopSlug || !menuId) return;
        const n = selected.size + selectedMy.size;
        if (n === 0) {
            showToast('Select at least one recipe or my item');
            return;
        }
        try {
            for (const rid of selected) {
                await menuPlannerApi.addMenuItem(shopSlug, menuId, {
                    day_of_week: day,
                    meal_type: mealType,
                    recipe_id: rid,
                    servings: 1,
                });
            }
            for (const mid of selectedMy) {
                await menuPlannerApi.addMenuItem(shopSlug, menuId, {
                    day_of_week: day,
                    meal_type: mealType,
                    customer_menu_item_id: mid,
                    servings: 1,
                });
            }
            showToast('Added to plan');
            if (fromMyMenuPick) {
                navigate(
                    buildMyMenuHubPath(shopSlug, returnTab, {
                        menuId,
                        calendarDay: returnTab === 'calendar' ? day : null,
                    })
                );
            } else {
                navigate(`/${shopSlug}/menu-planner/week/${menuId}?day=${day}`);
            }
        } catch (e: any) {
            showToast(e?.message || 'Could not add to plan');
        }
    };

    if (!shopSlug || !menuId) return null;

    const listHeight = fromMyMenuPick ? 'calc(100dvh - 300px)' : 'calc(100dvh - 220px)';

    const myItemsBlock =
        state.isLoggedIn && myItems.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px', color: '#1A1A1A' }}>My items</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {myItems.map((m) => {
                        const sel = selectedMy.has(m.id);
                        const img = getFullImageUrl(m.image_url);
                        return (
                            <div
                                key={m.id}
                                className="card"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 12,
                                    border: sel ? `2px solid ${GREEN}` : '1px solid var(--border-light)',
                                }}
                            >
                                <div
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 10,
                                        flexShrink: 0,
                                        background: img ? `url(${img}) center/cover` : '#E8F5E9',
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: GREEN }}>YOUR ITEM</div>
                                    <div style={{ fontWeight: 800, fontSize: 16 }}>{m.name}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleMy(m.id)}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: 999,
                                        border: 'none',
                                        fontWeight: 700,
                                        background: sel ? '#374151' : GREEN,
                                        color: '#fff',
                                        flexShrink: 0,
                                    }}
                                >
                                    {sel ? 'Remove' : 'Add'}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, margin: '20px 0 8px', color: '#1A1A1A' }}>Shop recipes</p>
            </div>
        ) : state.isLoggedIn ? (
            <p style={{ fontSize: 13, fontWeight: 800, margin: '0 0 12px', color: '#1A1A1A' }}>Shop recipes</p>
        ) : null;

    const searchAndCategories = (
        <>
            {myItemsBlock}
            <div style={{ marginTop: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                <input
                    className="input"
                    placeholder="Search title, cuisine, ingredients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && load(0, false, search)}
                    style={{ paddingLeft: 40, borderRadius: 999, height: 48, width: '100%' }}
                />
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12, paddingBottom: 4 }}>
                <button
                    type="button"
                    onClick={() => setActiveCategoryId('')}
                    style={{
                        flexShrink: 0,
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: !activeCategoryId ? 'none' : '1px solid var(--border)',
                        background: !activeCategoryId ? GREEN : '#fff',
                        color: !activeCategoryId ? '#fff' : '#1A1A1A',
                        fontWeight: 600,
                        fontSize: 13,
                    }}
                >
                    All
                </button>
                {categories.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setActiveCategoryId(c.id === activeCategoryId ? '' : c.id)}
                        style={{
                            flexShrink: 0,
                            padding: '8px 16px',
                            borderRadius: 999,
                            border: c.id === activeCategoryId ? 'none' : '1px solid var(--border)',
                            background: c.id === activeCategoryId ? GREEN : '#fff',
                            color: c.id === activeCategoryId ? '#fff' : '#1A1A1A',
                            fontWeight: 600,
                            fontSize: 13,
                        }}
                    >
                        {c.name}
                    </button>
                ))}
            </div>
        </>
    );

    const listAndFab = (
        <>
            <div ref={parentRef} style={{ height: listHeight, overflow: 'auto', padding: '0 16px 100px' }}>
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((v) => {
                        const r = items[v.index];
                        if (!r) return null;
                        const sel = selected.has(r.id);
                        const img = getFullImageUrl(r.image_url);
                        const mins = (r.prep_time_minutes || 0) + (r.cook_time_minutes || 0);
                        return (
                            <div
                                key={r.id}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${v.start}px)`,
                                }}
                            >
                                <div
                                    className="card"
                                    style={{
                                        marginBottom: 16,
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        border: '1px solid var(--border-light)',
                                        boxShadow: 'var(--shadow-sm)',
                                    }}
                                >
                                    <div
                                        style={{
                                            height: 180,
                                            background: img ? `url(${img}) center/cover` : '#E0E0E0',
                                            position: 'relative',
                                        }}
                                    >
                                        {sel && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 12,
                                                    left: 12,
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    background: GREEN,
                                                    color: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 800,
                                                }}
                                            >
                                                ✓
                                            </div>
                                        )}
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 12,
                                                right: 12,
                                                background: 'rgba(0,0,0,0.45)',
                                                color: '#fff',
                                                padding: '4px 10px',
                                                borderRadius: 999,
                                                fontSize: 12,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                        >
                                            🕐 {mins || '—'} min
                                        </div>
                                    </div>
                                    <div style={{ padding: 14 }}>
                                        {r.category_name && (
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: '#1565C0',
                                                    background: 'rgba(21,101,192,0.08)',
                                                    padding: '4px 8px',
                                                    borderRadius: 6,
                                                }}
                                            >
                                                {String(r.category_name).toUpperCase()}
                                            </span>
                                        )}
                                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '8px 0 6px' }}>{r.title}</h3>
                                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45, minHeight: 40 }}>
                                            {(r.description || '').slice(0, 120)}
                                            {(r.description || '').length > 120 ? '…' : ''}
                                        </p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                                            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                                {r.calories ? `${r.calories} kcal` : '—'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => toggle(r.id)}
                                                style={{
                                                    padding: '10px 18px',
                                                    borderRadius: 999,
                                                    border: 'none',
                                                    fontWeight: 700,
                                                    background: sel ? '#374151' : GREEN,
                                                    color: '#fff',
                                                }}
                                            >
                                                {sel ? 'Remove' : 'Add to Plan'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {loading && <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</p>}
                {!loading && items.length < total && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: '100%', marginTop: 8 }}
                        onClick={() => load(offset + items.length, true)}
                    >
                        Load more
                    </button>
                )}
            </div>

            <div
                style={{
                    position: 'fixed',
                    left: 16,
                    right: 16,
                    bottom: `calc(72px + var(--safe-bottom))`,
                    zIndex: 40,
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                <button
                    type="button"
                    onClick={confirm}
                    style={{
                        background: '#374151',
                        color: '#fff',
                        fontWeight: 800,
                        padding: '14px 28px',
                        borderRadius: 999,
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        boxShadow: 'var(--shadow-lg)',
                    }}
                >
                    Confirm Selection
                    <span
                        style={{
                            background: GREEN,
                            color: '#fff',
                            borderRadius: '50%',
                            minWidth: 28,
                            height: 28,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                        }}
                    >
                        {selected.size + selectedMy.size}
                    </span>
                </button>
            </div>
        </>
    );

    if (fromMyMenuPick) {
        return (
            <div className="page fade-in" style={{ paddingBottom: 120, minHeight: '100dvh', background: '#fff' }}>
                <div
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 50,
                        background: '#fff',
                        borderBottom: '1px solid var(--border-light)',
                    }}
                >
                    <div style={{ padding: '12px 16px 0', maxWidth: 560, margin: '0 auto' }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px', color: '#1A1A1A' }}>My Menu</h1>
                        <MyMenuTabStrip shopSlug={shopSlug} activeTab={returnTab} menuId={menuId} />
                    </div>
                </div>
                <div style={{ padding: '12px 16px 0', maxWidth: 560, margin: '0 auto' }}>
                    <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Add to meal</p>
                </div>
                <div style={{ padding: '0 16px 12px', maxWidth: 560, margin: '0 auto' }}>{searchAndCategories}</div>
                {listAndFab}
            </div>
        );
    }

    return (
        <div className="page fade-in" style={{ paddingBottom: 120, minHeight: '100dvh', background: '#fff' }}>
            <MenuPlannerHeader />
            <div style={{ padding: '0 16px 12px', maxWidth: 560, margin: '0 auto' }}>
                <Link
                    to={`/${shopSlug}/menu-planner/week/${menuId}?day=${day}`}
                    style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}
                >
                    ← Calendar
                </Link>
                {searchAndCategories}
            </div>
            {listAndFab}
        </div>
    );
}
