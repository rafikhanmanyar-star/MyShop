import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { menuPlannerApi } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';

const GREEN = '#2E7D32';

export default function NutritionSummaryPage() {
    const { shopSlug, menuId } = useParams();
    const { state, showToast } = useApp();
    const [detail, setDetail] = useState<any>(null);

    useEffect(() => {
        if (!shopSlug || !menuId || !state.isLoggedIn) return;
        (async () => {
            try {
                const d = await menuPlannerApi.getMenu(shopSlug, menuId);
                setDetail(d);
            } catch (e: any) {
                showToast(e?.message || 'Failed to load');
            }
        })();
    }, [shopSlug, menuId, state.isLoggedIn, showToast]);

    const ns = detail?.nutrition_summary;

    return (
        <div className="page fade-in" style={{ padding: 16, paddingBottom: 100, background: '#FAFAFA' }}>
            <MenuPlannerHeader title="Nutrition summary" />
            <Link to={`/${shopSlug}/menu-planner`} style={{ color: GREEN, fontWeight: 600 }}>
                ← Dashboard
            </Link>
            {!detail ? (
                <p style={{ marginTop: 24 }}>Loading…</p>
            ) : (
                <div style={{ maxWidth: 480, marginTop: 20 }}>
                    <div className="card" style={{ padding: 20, borderRadius: 14 }}>
                        <h2 style={{ fontWeight: 900, marginBottom: 12 }}>Weekly totals</h2>
                        <p style={{ fontSize: 16, marginBottom: 8 }}>
                            Est. daily calories: <strong>{ns?.estimated_daily_calories}</strong>
                        </p>
                        <p style={{ fontSize: 16, marginBottom: 8 }}>
                            Week calories (approx.): <strong>{ns?.total_week_calories}</strong>
                        </p>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            Macro grams are estimated from calorie totals using a balanced split when detailed macros are not stored per
                            recipe.
                        </p>
                        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                            {['protein_g', 'carbs_g', 'fat_g'].map((k) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ textTransform: 'capitalize' }}>{k.replace('_g', '')}</span>
                                    <strong>{ns?.macros_estimate_g?.[k] ?? '—'} g</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
