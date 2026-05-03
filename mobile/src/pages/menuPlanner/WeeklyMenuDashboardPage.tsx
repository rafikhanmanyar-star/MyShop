import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { publicApi, menuPlannerApi, getFullImageUrl } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';

const GREEN = '#2E7D32';

function mondayOfWeek(d: Date): Date {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

function iso(d: Date) {
    return d.toISOString().slice(0, 10);
}

function formatWeekRange(startIso: string): string {
    const a = new Date(startIso + 'T12:00:00');
    const b = new Date(a);
    b.setDate(b.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${a.toLocaleDateString(undefined, opts)} — ${b.toLocaleDateString(undefined, opts)}`;
}

export default function WeeklyMenuDashboardPage() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    const [menuId, setMenuId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<any[]>([]);
    const [recipeCarousel, setRecipeCarousel] = useState<any[]>([]);

    const weekStartIso = useMemo(() => iso(mondayOfWeek(new Date())), []);

    const load = useCallback(async () => {
        if (!shopSlug || !state.isLoggedIn) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const list = await menuPlannerApi.listMenus(shopSlug, { limit: 5, offset: 0 });
            const items = (list as any)?.items || [];
            let pick = items.find((m: any) => String(m.week_start_date).slice(0, 10) === weekStartIso);
            if (!pick && items[0]) pick = items[0];
            if (pick?.id) {
                setMenuId(pick.id);
                const d = await menuPlannerApi.getMenu(shopSlug, pick.id);
                setDetail(d);
            } else {
                setMenuId(null);
                setDetail(null);
            }

            const t = await menuPlannerApi.listMenuTemplates(shopSlug);
            setTemplates((t as any)?.items || []);

            const rec = await publicApi.getRecipes(shopSlug, { featured: 'true', limit: 12, offset: 0 });
            setRecipeCarousel((rec as any)?.items || []);
        } catch (e: any) {
            showToast(e?.message || 'Could not load menu planner');
        } finally {
            setLoading(false);
        }
    }, [shopSlug, state.isLoggedIn, weekStartIso, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const createWeek = async () => {
        if (!shopSlug) return;
        try {
            const { id } = (await menuPlannerApi.createMenu(shopSlug, {
                title: 'This week',
                week_start_date: weekStartIso,
            })) as any;
            showToast('Week plan created');
            navigate(`/${shopSlug}/menu-planner/week/${id}`);
        } catch (e: any) {
            showToast(e?.message || 'Create failed');
        }
    };

    const ns = detail?.nutrition_summary;
    const planned = ns?.progress?.planned_slots ?? 0;
    const target = ns?.progress?.target_slots ?? 21;
    const pct = ns?.progress?.percent ?? 0;
    const macros = ns?.macros_estimate_g;
    const targets = ns?.macro_targets_g;
    const lastList = detail?.last_shopping_list;
    const estTotal = detail?.estimated_cart_total;

    if (!shopSlug) return null;

    if (!state.isLoggedIn) {
        return (
            <div className="page fade-in" style={{ paddingBottom: 100 }}>
                <MenuPlannerHeader />
                <div style={{ padding: 24, textAlign: 'center' }}>
                    <p style={{ marginBottom: 16 }}>Sign in to use the Weekly Menu Planner.</p>
                    <Link to={`/${shopSlug}/login`} className="btn btn-primary" style={{ background: GREEN }}>
                        Log in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page fade-in" style={{ paddingBottom: 100, background: '#FAFAFA' }}>
            <MenuPlannerHeader />

            <div style={{ padding: '16px', maxWidth: 560, margin: '0 auto' }}>
                <div style={{ marginBottom: 8 }}>
                    <Link to={`/${shopSlug}`} style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>
                        ← Home
                    </Link>
                </div>

                {loading ? (
                    <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading planner…
                    </div>
                ) : !menuId ? (
                    <div className="card" style={{ padding: 24 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Start your week</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
                            Create a meal plan for the week of <strong>{formatWeekRange(weekStartIso)}</strong>.
                        </p>
                        <button type="button" className="btn btn-primary" style={{ width: '100%', background: GREEN }} onClick={createWeek}>
                            Create weekly plan
                        </button>
                        <Link
                            to={`/${shopSlug}/menu-planner/templates`}
                            style={{ display: 'block', textAlign: 'center', marginTop: 16, color: GREEN, fontWeight: 600, fontSize: 14 }}
                        >
                            Browse templates
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A', margin: '8px 0 12px' }}>Current Week</h2>
                        <div
                            className="card"
                            style={{
                                padding: 16,
                                borderRadius: 12,
                                boxShadow: 'var(--shadow)',
                                border: '1px solid var(--border-light)',
                                marginBottom: 20,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.6, marginBottom: 6 }}>
                                        PROGRESS
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>
                                        {planned}/{target} Meals Planned
                                    </div>
                                </div>
                                <span
                                    style={{
                                        background: 'rgba(46, 125, 50, 0.12)',
                                        color: GREEN,
                                        fontWeight: 700,
                                        fontSize: 13,
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                    }}
                                >
                                    {pct}% Done
                                </span>
                            </div>
                            <div
                                style={{
                                    marginTop: 14,
                                    height: 8,
                                    borderRadius: 4,
                                    background: '#E8E8E8',
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ width: `${pct}%`, height: '100%', background: GREEN, transition: 'width 0.3s' }} />
                            </div>
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ marginTop: 16, width: '100%', borderColor: GREEN, color: GREEN }}
                                onClick={() => navigate(`/${shopSlug}/menu-planner/week/${menuId}`)}
                            >
                                Open calendar
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Nutrition at a Glance</h2>
                            <Link to={`/${shopSlug}/menu-planner/nutrition/${menuId}`} style={{ color: GREEN, fontWeight: 600, fontSize: 14 }}>
                                Details
                            </Link>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                            {[
                                { k: 'protein', label: 'PROTEIN', cur: macros?.protein_g ?? 0, tgt: targets?.protein_g ?? 120, hue: GREEN },
                                { k: 'carbs', label: 'CARBS', cur: macros?.carbs_g ?? 0, tgt: targets?.carbs_g ?? 250, hue: '#F59E0B' },
                                { k: 'fat', label: 'FATS', cur: macros?.fat_g ?? 0, tgt: targets?.fat_g ?? 70, hue: '#5C6BC0' },
                            ].map((m) => {
                                const p = m.tgt > 0 ? Math.min(100, Math.round((m.cur / m.tgt) * 100)) : 0;
                                return (
                                    <div
                                        key={m.k}
                                        className="card"
                                        style={{ padding: 12, borderRadius: 12, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}
                                    >
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 6 }}>
                                            {m.label}
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                                            {m.cur}g / {m.tgt}g
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: '#eee' }}>
                                            <div style={{ width: `${p}%`, height: '100%', background: m.hue, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, lineHeight: 1.4 }}>
                            Macros are estimated from recipe calories when full nutrition data is not stored.
                        </p>

                        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Weekly Grocery Budget</h2>
                        <div
                            className="card"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: 12,
                                marginBottom: 20,
                                borderRadius: 12,
                                boxShadow: 'var(--shadow)',
                            }}
                        >
                            <div
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 10,
                                    background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                                    flexShrink: 0,
                                }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800 }}>Empress Market List</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    Est. Total:{' '}
                                    {estTotal != null ? `PKR ${Number(estTotal).toLocaleString()}` : 'Generate list for estimate'}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ background: GREEN, flexShrink: 0 }}
                                onClick={() => {
                                    if (lastList?.id) navigate(`/${shopSlug}/menu-planner/shopping/${lastList.id}`);
                                    else showToast('Generate a shopping list from the calendar first.');
                                }}
                            >
                                View
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Pakistani Feast Templates</h2>
                            <Link to={`/${shopSlug}/menu-planner/templates`} style={{ color: GREEN, fontWeight: 600, fontSize: 14 }}>
                                See All
                            </Link>
                        </div>
                        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
                            {(templates.length ? templates : recipeCarousel).slice(0, 8).map((t: any) => {
                                const isTpl = Boolean(t.visibility);
                                const title = isTpl ? t.name : t.title;
                                const img = !isTpl ? getFullImageUrl(t.image_url) : null;
                                return (
                                    <div
                                        key={t.id}
                                        className="card"
                                        style={{
                                            minWidth: 160,
                                            maxWidth: 160,
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            boxShadow: 'var(--shadow)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{ height: 100, background: img ? `url(${img}) center/cover` : '#E0E0E0', position: 'relative' }}>
                                            <button
                                                type="button"
                                                aria-label="Save template"
                                                style={{
                                                    position: 'absolute',
                                                    top: 8,
                                                    right: 8,
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    border: 'none',
                                                    boxShadow: 'var(--shadow-sm)',
                                                    fontSize: 14,
                                                }}
                                                onClick={() => showToast('Save template from your current plan on the calendar.')}
                                            >
                                                ★
                                            </button>
                                        </div>
                                        <div style={{ padding: 10 }}>
                                            <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{title}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PKR — / meal</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
