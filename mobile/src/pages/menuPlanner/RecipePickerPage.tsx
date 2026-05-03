import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useApp } from '../../context/AppContext';
import { publicApi, menuPlannerApi, getFullImageUrl } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';

const GREEN = '#2E7D32';

const CHIPS = [
    { id: 'pakistani', label: 'Pakistani', search: 'pakistani' },
    { id: 'curry', label: 'Curry', search: 'curry' },
    { id: 'spicy', label: 'Spicy', search: 'spicy' },
    { id: 'bbq', label: 'BBQ', search: 'bbq' },
    { id: 'rice', label: 'Rice', search: 'rice' },
];

function parseReturnTab(s: string | null): 'dashboard' | 'calendar' | 'shopping' | 'configure' {
    if (s === 'configure' || s === 'calendar' || s === 'dashboard' || s === 'shopping') return s;
    return 'calendar';
}

export default function RecipePickerPage() {
    const { shopSlug, menuId: routeMenuId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showToast } = useApp();

    const menuId = routeMenuId || searchParams.get('menuId') || '';
    const returnTab = parseReturnTab(searchParams.get('returnTab'));
    const fromMyMenuPick = Boolean(!routeMenuId && searchParams.get('menuId'));

    const day = Number(searchParams.get('day') || '0');
    const mealType = searchParams.get('mealType') || 'lunch';

    const [search, setSearch] = useState('');
    const [activeChip, setActiveChip] = useState('pakistani');
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const parentRef = useRef<HTMLDivElement>(null);

    const load = useCallback(
        async (nextOffset: number, append: boolean, searchQuery?: string) => {
            if (!shopSlug) return;
            setLoading(true);
            try {
                const chip = CHIPS.find((c) => c.id === activeChip);
                const raw = searchQuery !== undefined ? searchQuery : search;
                const q = raw.trim() || chip?.search || '';
                const data = await publicApi.getRecipes(shopSlug, {
                    search: q || undefined,
                    limit: 20,
                    offset: nextOffset,
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
        [shopSlug, activeChip]
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

    const confirm = async () => {
        if (!shopSlug || !menuId || selected.size === 0) {
            showToast('Select at least one recipe');
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
            showToast('Recipes added to plan');
            if (fromMyMenuPick) {
                navigate(`/${shopSlug}/my-menu?tab=${returnTab}`);
            } else {
                navigate(`/${shopSlug}/menu-planner/week/${menuId}`);
            }
        } catch (e: any) {
            showToast(e?.message || 'Could not add recipes');
        }
    };

    if (!shopSlug || !menuId) return null;

    return (
        <div className="page fade-in" style={{ paddingBottom: 120, minHeight: '100dvh', background: '#fff' }}>
            <MenuPlannerHeader />
            <div style={{ padding: '0 16px 12px', maxWidth: 560, margin: '0 auto' }}>
                <Link
                    to={fromMyMenuPick ? `/${shopSlug}/my-menu?tab=${returnTab}` : `/${shopSlug}/menu-planner/week/${menuId}`}
                    style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}
                >
                    ← {fromMyMenuPick ? 'Back' : 'Calendar'}
                </Link>
                <div style={{ marginTop: 12, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                    <input
                        className="input"
                        placeholder="Search Pakistani recipes."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && load(0, false, search)}
                        style={{ paddingLeft: 40, borderRadius: 999, height: 48, width: '100%' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12, paddingBottom: 4 }}>
                    {CHIPS.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveChip(c.id)}
                            style={{
                                flexShrink: 0,
                                padding: '8px 16px',
                                borderRadius: 999,
                                border: c.id === activeChip ? 'none' : '1px solid var(--border)',
                                background: c.id === activeChip ? GREEN : '#fff',
                                color: c.id === activeChip ? '#fff' : '#1A1A1A',
                                fontWeight: 600,
                                fontSize: 13,
                            }}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            <div ref={parentRef} style={{ height: 'calc(100dvh - 220px)', overflow: 'auto', padding: '0 16px 100px' }}>
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
                        {selected.size}
                    </span>
                </button>
            </div>
        </div>
    );
}
