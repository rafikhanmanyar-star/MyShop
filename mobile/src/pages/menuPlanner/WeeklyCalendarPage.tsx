import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useMyMenuLayout } from '../../context/MyMenuLayoutContext';
import { menuPlannerApi, getFullImageUrl } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';
import { cacheMenuDetail, getCachedMenuDetail } from '../../services/menuPlannerCache';
import { enqueueMenuPlannerOp } from '../../services/menuPlannerSyncQueue';

const GREEN = '#2E7D32';
const PURPLE = '#7E57C2';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_ORDER: { key: string; label: string }[] = [
    { key: 'breakfast', label: 'BREAKFAST' },
    { key: 'lunch', label: 'LUNCH' },
    { key: 'dinner', label: 'DINNER' },
    { key: 'snack', label: 'SNACK' },
];

function parseIsoDate(s: string): Date {
    return new Date(s.slice(0, 10) + 'T12:00:00');
}

function addDays(iso: string, n: number): string {
    const d = parseIsoDate(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function itemDisplayName(it: any): string {
    return it.recipe_title || it.customer_item_name || it.custom_meal_name || 'Meal';
}

export type WeeklyCalendarPageProps = {
    menuIdOverride?: string;
    embedded?: boolean;
};

export default function WeeklyCalendarPage({
    menuIdOverride,
    embedded = false,
}: WeeklyCalendarPageProps) {
    const { shopSlug, menuId: routeMenuId } = useParams();
    const menuId = menuIdOverride ?? routeMenuId;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const myMenu = useMyMenuLayout();
    const { state, showToast } = useApp();

    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [weekOffset, setWeekOffset] = useState(0);
    const [customOpen, setCustomOpen] = useState<{ day: number; meal: string } | null>(null);
    const [customName, setCustomName] = useState('');
    const [dragItemId, setDragItemId] = useState<string | null>(null);

    const selectedDay = useMemo(() => {
        const raw = searchParams.get('day');
        if (raw === null || raw === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 6 || !Number.isInteger(n)) return null;
        return n;
    }, [searchParams]);

    const openDayDetail = useCallback(
        (dow: number) => {
            setSearchParams(
                (prev) => {
                    const n = new URLSearchParams(prev);
                    n.set('day', String(dow));
                    return n;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const closeDayDetail = useCallback(() => {
        setSearchParams(
            (prev) => {
                const n = new URLSearchParams(prev);
                n.delete('day');
                return n;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    const baseWeekStart = useMemo(
        () => (detail?.menu?.week_start_date ? String(detail.menu.week_start_date).slice(0, 10) : null),
        [detail]
    );

    const displayWeekStart = useMemo(() => {
        if (!baseWeekStart) return null;
        if (weekOffset === 0) return baseWeekStart;
        return addDays(baseWeekStart, weekOffset * 7);
    }, [baseWeekStart, weekOffset]);

    const load = useCallback(async () => {
        if (!shopSlug || !menuId || !state.isLoggedIn) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const d = await menuPlannerApi.getMenu(shopSlug, menuId);
            setDetail(d);
            await cacheMenuDetail(shopSlug, menuId, d);
        } catch (e: any) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                const c = await getCachedMenuDetail(shopSlug, menuId);
                if (c?.payload) {
                    setDetail(c.payload);
                    showToast('Offline — showing saved plan.');
                    setLoading(false);
                    return;
                }
            }
            showToast(e?.message || 'Could not load plan');
        } finally {
            setLoading(false);
        }
    }, [shopSlug, menuId, state.isLoggedIn, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const items = (detail?.items || []) as any[];
    const ns = detail?.nutrition_summary;

    const byDayMeal = useMemo(() => {
        const m = new Map<string, any[]>();
        for (const it of items) {
            const k = `${it.day_of_week}:${it.meal_type}`;
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(it);
        }
        for (const arr of m.values()) arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return m;
    }, [items]);

    const targetKcalForDay = (dow: number) => {
        const dayItems = items.filter((i) => i.day_of_week === dow && i.recipe_calories);
        let sum = 0;
        for (const i of dayItems) {
            const base = Math.max(1, Number(i.recipe_base_servings) || 1);
            sum += (Number(i.recipe_calories) * Number(i.servings || 1)) / base;
        }
        return Math.round(sum) || 2000;
    };

    const openPick = (day: number, meal: string) => {
        if (!shopSlug || !menuId) return;
        const returnTab = 'calendar';
        if (embedded) {
            navigate(
                `/${shopSlug}/my-menu/pick?menuId=${encodeURIComponent(menuId)}&day=${day}&mealType=${encodeURIComponent(meal)}&returnTab=${returnTab}`
            );
        } else {
            navigate(`/${shopSlug}/menu-planner/week/${menuId}/pick?day=${day}&mealType=${encodeURIComponent(meal)}`);
        }
    };

    const addCustom = async () => {
        if (!shopSlug || !menuId || !customOpen) return;
        const name = customName.trim();
        if (!name) {
            showToast('Enter a meal name');
            return;
        }
        const body = {
            day_of_week: customOpen.day,
            meal_type: customOpen.meal,
            custom_meal_name: name,
            servings: 1,
        };
        const online = typeof navigator !== 'undefined' && navigator.onLine;
        if (online) {
            try {
                await menuPlannerApi.addMenuItem(shopSlug, menuId, body);
                showToast('Meal added');
            } catch (e: any) {
                showToast(e?.message || 'Failed');
                return;
            }
        } else {
            await enqueueMenuPlannerOp(shopSlug, 'add_menu_item', { menuId, body });
            showToast('Saved offline — will sync when online');
        }
        setCustomOpen(null);
        setCustomName('');
        await load();
    };

    const removeItem = async (itemId: string) => {
        if (!shopSlug) return;
        const online = typeof navigator !== 'undefined' && navigator.onLine;
        if (online) {
            try {
                await menuPlannerApi.deleteMenuItem(shopSlug, itemId);
            } catch (e: any) {
                showToast(e?.message || 'Failed');
                return;
            }
        } else {
            await enqueueMenuPlannerOp(shopSlug, 'delete_menu_item', { itemId });
            showToast('Queued delete for sync');
        }
        await load();
    };

    const onDropTo = async (day: number, meal: string) => {
        if (!dragItemId || !shopSlug) return;
        const body = { day_of_week: day, meal_type: meal };
        const online = typeof navigator !== 'undefined' && navigator.onLine;
        if (online) {
            try {
                await menuPlannerApi.moveMenuItem(shopSlug, dragItemId, body);
            } catch (e: any) {
                showToast(e?.message || 'Move failed');
                return;
            }
        } else {
            await enqueueMenuPlannerOp(shopSlug, 'move_menu_item', { itemId: dragItemId, body });
            showToast('Move queued for sync');
        }
        setDragItemId(null);
        await load();
    };

    const genList = async () => {
        if (!shopSlug || !menuId) return;
        try {
            const r = await menuPlannerApi.generateShoppingList(shopSlug, menuId);
            const id = (r as any)?.id;
            if (id) {
                if (myMenu) {
                    myMenu.setListId(String(id));
                    myMenu.setTab('shopping');
                } else {
                    navigate(`/${shopSlug}/menu-planner/shopping/${id}`);
                }
            }
        } catch (e: any) {
            showToast(e?.message || 'Could not generate list');
        }
    };

    const renderDayEditor = (dow: number) => {
        const dayName = DAY_NAMES[dow];
        const dateIso = displayWeekStart ? addDays(displayWeekStart, dow) : '';
        const headerDate = dateIso ? parseIsoDate(dateIso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        const tgt = targetKcalForDay(dow);

        return (
            <section key={dow} style={{ marginTop: selectedDay !== null ? 12 : 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
                        {dayName}, {headerDate}
                    </h3>
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: PURPLE,
                            background: 'rgba(126,87,194,0.12)',
                            padding: '4px 10px',
                            borderRadius: 8,
                        }}
                    >
                        TARGET: {tgt} KCAL
                    </span>
                </div>

                {MEAL_ORDER.map(({ key, label }) => (
                    <div
                        key={key}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropTo(dow, key)}
                        style={{ marginBottom: 10 }}
                    >
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                        {(byDayMeal.get(`${dow}:${key}`) || []).map((it: any) => (
                            <div
                                key={it.id}
                                draggable
                                onDragStart={() => setDragItemId(it.id)}
                                className="card"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: 10,
                                    marginBottom: 8,
                                    borderRadius: 12,
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div
                                    style={{
                                        width: 52,
                                        height: 52,
                                        borderRadius: 8,
                                        background: (() => {
                                            const img = getFullImageUrl(it.recipe_image_url || it.customer_item_image_url);
                                            return img ? `url(${img}) center/cover` : '#E0E0E0';
                                        })(),
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{label}</div>
                                    <div style={{ fontWeight: 800, fontSize: 15 }}>{itemDisplayName(it)}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                        ⏱{' '}
                                        {it.customer_menu_item_id
                                            ? '—'
                                            : `${(it.prep_time_minutes || 0) + (it.cook_time_minutes || 0)}m`}
                                        · {it.recipe_calories ? `${it.recipe_calories} kcal` : '—'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Swap meal"
                                    style={{ border: 'none', background: 'transparent', fontSize: 18, color: GREEN }}
                                    onClick={() => openPick(dow, key)}
                                >
                                    ⇄
                                </button>
                                <button
                                    type="button"
                                    aria-label="Remove"
                                    style={{ border: 'none', background: 'transparent', fontSize: 16, color: '#999' }}
                                    onClick={() => removeItem(it.id)}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => openPick(dow, key)}
                            style={{
                                width: '100%',
                                border: `2px dashed ${GREEN}`,
                                borderRadius: 12,
                                padding: 14,
                                background: '#fff',
                                color: GREEN,
                                fontWeight: 700,
                                fontSize: 20,
                                marginTop: 4,
                            }}
                        >
                            +
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCustomOpen({ day: dow, meal: key });
                                setCustomName('');
                            }}
                            style={{
                                width: '100%',
                                marginTop: 6,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                                background: 'none',
                                border: 'none',
                                textDecoration: 'underline',
                            }}
                        >
                            Add custom {label.toLowerCase()} name…
                        </button>
                    </div>
                ))}
            </section>
        );
    };

    if (!shopSlug) return null;

    if (!state.isLoggedIn) {
        return (
            <div className="page fade-in" style={{ paddingBottom: 100 }}>
                {!embedded && <MenuPlannerHeader />}
                <p style={{ padding: 24, color: 'var(--text-muted)', lineHeight: 1.5 }}>An active session is required to edit this plan.</p>
            </div>
        );
    }

    if (!menuId) {
        return (
            <div className="page fade-in" style={{ padding: 24, paddingBottom: 120, background: '#F5F5F7' }}>
                {!embedded && <MenuPlannerHeader />}
                <p style={{ marginBottom: 16, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Create a weekly plan from the dashboard first, then you can add meals and generate a shopping list.
                </p>
                {embedded ? (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Choose the <strong>Dashboard</strong> tab above to create a weekly plan.
                    </p>
                ) : (
                    <Link to={`/${shopSlug}/menu-planner`} style={{ color: GREEN, fontWeight: 700 }}>
                        Open dashboard
                    </Link>
                )}
            </div>
        );
    }

    const weekLabel = displayWeekStart
        ? `${parseIsoDate(displayWeekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseIsoDate(addDays(displayWeekStart, 6)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : '…';

    const dailyKcal = ns?.estimated_daily_calories ?? 2150;
    const dailyBudget = 1200;

    const weekChrome = !loading && detail && (
        <>
            <div
                className="card"
                style={{
                    marginTop: 0,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow)',
                }}
            >
                <button
                    type="button"
                    aria-label="Previous week view"
                    style={{ border: 'none', background: 'transparent', fontSize: 20, color: GREEN }}
                    onClick={() => setWeekOffset((w) => w - 1)}
                >
                    ‹
                </button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>Week of {weekLabel}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginTop: 4 }}>ACTIVE PLANNING PHASE</div>
                </div>
                <button
                    type="button"
                    aria-label="Next week view"
                    style={{ border: 'none', background: 'transparent', fontSize: 20, color: GREEN }}
                    onClick={() => setWeekOffset((w) => w + 1)}
                >
                    ›
                </button>
            </div>

            {weekOffset !== 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Viewing a shifted week for reference. Meal edits apply to your saved plan&apos;s dates.
                </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div style={{ background: 'rgba(46,125,50,0.1)', borderRadius: 14, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: '#1B5E20' }}>DAILY CALORIES</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{dailyKcal.toLocaleString()} / 2500</div>
                    <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.08)' }}>
                        <div
                            style={{
                                width: `${Math.min(100, Math.round((dailyKcal / 2500) * 100))}%`,
                                height: '100%',
                                background: GREEN,
                                borderRadius: 3,
                            }}
                        />
                    </div>
                </div>
                <div style={{ background: 'rgba(212, 175, 55, 0.15)', borderRadius: 14, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: '#795548' }}>EST. BUDGET</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>Rs {dailyBudget.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>📋 Per day avg</div>
                </div>
            </div>
        </>
    );

    return (
        <div className="page fade-in" style={{ paddingBottom: embedded ? 16 : 120, background: '#F5F5F7' }}>
            {!embedded && <MenuPlannerHeader />}

            <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
                {!embedded && (
                    <Link to={`/${shopSlug}/menu-planner`} style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>
                        ← Dashboard
                    </Link>
                )}

                {loading || !detail ? (
                    <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>Loading calendar…</p>
                ) : (
                    <>
                        <div
                            style={{
                                marginTop: embedded ? 4 : 12,
                                marginBottom: 12,
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={genList}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: GREEN,
                                    borderRadius: 999,
                                    padding: '8px 14px',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    boxShadow: '0 2px 8px rgba(46,125,50,0.2)',
                                    width: 'auto',
                                    border: 'none',
                                }}
                            >
                                <span aria-hidden>🛒</span>
                                Generate list
                            </button>
                        </div>

                        {weekChrome}

                        {selectedDay === null ? (
                            <>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.45 }}>
                                    Tap a day to add or edit meals. Use <strong>Menu planner</strong> for recipes and custom items, or type a
                                    quick custom name on the day screen.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                                    {DAY_NAMES.map((dayName, dow) => {
                                        const dateIso = displayWeekStart ? addDays(displayWeekStart, dow) : '';
                                        const headerDate = dateIso
                                            ? parseIsoDate(dateIso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                            : '';
                                        const tgt = targetKcalForDay(dow);
                                        const lines = MEAL_ORDER.map(({ key, label }) => {
                                            const mealItems = byDayMeal.get(`${dow}:${key}`) || [];
                                            const text =
                                                mealItems.length > 0 ? mealItems.map(itemDisplayName).join(', ') : '—';
                                            return { label, text };
                                        });
                                        const hasAny = lines.some((l) => l.text !== '—');

                                        return (
                                            <button
                                                key={dow}
                                                type="button"
                                                onClick={() => openDayDetail(dow)}
                                                className="card"
                                                style={{
                                                    textAlign: 'left',
                                                    padding: 14,
                                                    borderRadius: 14,
                                                    border: '1px solid var(--border-light)',
                                                    boxShadow: 'var(--shadow)',
                                                    background: '#fff',
                                                    cursor: 'pointer',
                                                    width: '100%',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>
                                                        {dayName}
                                                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>, {headerDate}</span>
                                                    </div>
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            color: PURPLE,
                                                            background: 'rgba(126,87,194,0.12)',
                                                            padding: '4px 8px',
                                                            borderRadius: 8,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {tgt} kcal
                                                    </span>
                                                </div>
                                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {lines.map(({ label, text }) => (
                                                        <div key={label} style={{ fontSize: 13, lineHeight: 1.35 }}>
                                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.4 }}>
                                                                {label}
                                                            </span>
                                                            <div style={{ fontWeight: text === '—' ? 500 : 600, color: text === '—' ? '#aaa' : '#333' }}>
                                                                {text}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {!hasAny && (
                                                    <p style={{ margin: '10px 0 0', fontSize: 12, color: GREEN, fontWeight: 700 }}>
                                                        Tap to plan this day →
                                                    </p>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={closeDayDetail}
                                    style={{
                                        marginTop: 16,
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        fontSize: 15,
                                        fontWeight: 700,
                                        color: GREEN,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ← Week
                                </button>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
                                    Add meals from <strong>Menu planner</strong> (shop recipes or your own items) or type a quick custom name.
                                    Drag cards to move meals between slots or days — open other days from the week view to drop there.
                                </p>
                                {renderDayEditor(selectedDay)}
                            </>
                        )}
                    </>
                )}
            </div>

            {customOpen && (
                <div
                    className="bottom-sheet-overlay"
                    style={{ zIndex: 2000 }}
                    role="presentation"
                    onClick={() => setCustomOpen(null)}
                >
                    <div
                        className="bottom-sheet"
                        role="dialog"
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: 20 }}
                    >
                        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Custom meal</h3>
                        <input
                            className="input"
                            placeholder="e.g. Leftover daal, takeout, eggs"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            style={{ width: '100%', marginBottom: 16 }}
                        />
                        <button type="button" className="btn btn-primary" style={{ width: '100%', background: GREEN }} onClick={addCustom}>
                            Add to plan
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
