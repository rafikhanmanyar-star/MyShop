import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { menuPlannerApi } from '../../api';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';

const GREEN = '#2E7D32';

export default function MenuTemplatesPage() {
    const { shopSlug } = useParams();
    const { state, showToast } = useApp();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [applyMenuId, setApplyMenuId] = useState('');

    useEffect(() => {
        if (!shopSlug || !state.isLoggedIn) {
            setLoading(false);
            return;
        }
        (async () => {
            try {
                const r = await menuPlannerApi.listMenuTemplates(shopSlug);
                setItems((r as any)?.items || []);
                const menus = await menuPlannerApi.listMenus(shopSlug, { limit: 1 });
                const first = (menus as any)?.items?.[0];
                if (first?.id) setApplyMenuId(first.id);
            } catch (e: any) {
                showToast(e?.message || 'Failed to load templates');
            } finally {
                setLoading(false);
            }
        })();
    }, [shopSlug, state.isLoggedIn, showToast]);

    const apply = async (templateId: string) => {
        if (!shopSlug || !applyMenuId) {
            showToast('Create a weekly plan first from the dashboard.');
            return;
        }
        try {
            await menuPlannerApi.applyTemplate(shopSlug, applyMenuId, templateId);
            showToast('Template applied');
        } catch (e: any) {
            showToast(e?.message || 'Apply failed');
        }
    };

    return (
        <div className="page fade-in" style={{ padding: 16, paddingBottom: 100 }}>
            <MenuPlannerHeader title="Menu templates" />
            <Link to={`/${shopSlug}/menu-planner`} style={{ color: GREEN, fontWeight: 600 }}>
                ← Back
            </Link>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: '16px 0' }}>Templates</h1>
            {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            ) : items.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    No templates yet. Save one from a full week plan (API: create template from menu).
                </p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {items.map((t) => (
                        <li key={t.id} className="card" style={{ padding: 16, marginBottom: 12, borderRadius: 12 }}>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{t.visibility}</div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ marginTop: 12, background: GREEN }}
                                onClick={() => apply(t.id)}
                            >
                                Apply to latest plan
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
