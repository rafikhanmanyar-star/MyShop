import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MyMenuLayoutContext, type MyMenuTab } from '../context/MyMenuLayoutContext';
import MyMenuTabStrip from '../components/menuPlanner/MyMenuTabStrip';
import WeeklyMenuDashboardPage from './menuPlanner/WeeklyMenuDashboardPage';
import WeeklyCalendarPage from './menuPlanner/WeeklyCalendarPage';
import ShoppingListPage from './menuPlanner/ShoppingListPage';
import MenuPlannerPage from './menuPlanner/MenuPlannerPage';

function parseTab(s: string | null): MyMenuTab {
    if (s === 'configure') return 'planner'; // legacy URL
    if (s === 'calendar' || s === 'shopping' || s === 'planner' || s === 'dashboard') return s;
    return 'dashboard';
}

/** Hub: dashboard + week calendar + shopping list + meal configuration (embedded planner screens). */
export default function MyMenuPage() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();

    const tabFromUrl = parseTab(searchParams.get('tab'));
    const menuIdFromUrl = searchParams.get('menuId');
    const [menuId, setMenuIdState] = useState<string | null>(menuIdFromUrl);
    const listId = searchParams.get('listId');

    const activeTab = tabFromUrl;

    useEffect(() => {
        setMenuIdState(menuIdFromUrl);
    }, [menuIdFromUrl]);

    const setMenuId = useCallback(
        (id: string | null) => {
            setMenuIdState(id);
            setSearchParams(
                (prev) => {
                    const n = new URLSearchParams(prev);
                    if (id) n.set('menuId', id);
                    else n.delete('menuId');
                    return n;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const setTab = useCallback(
        (t: MyMenuTab) => {
            setSearchParams(
                (prev) => {
                    const n = new URLSearchParams(prev);
                    n.set('tab', t);
                    return n;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const setListId = useCallback(
        (id: string | null) => {
            setSearchParams(
                (prev) => {
                    const n = new URLSearchParams(prev);
                    if (id) n.set('listId', id);
                    else n.delete('listId');
                    return n;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const layoutValue = useMemo(
        () => ({
            menuId,
            setMenuId,
            listId,
            setListId,
            activeTab,
            setTab,
        }),
        [menuId, listId, activeTab, setTab, setListId]
    );

    if (!shopSlug) return null;

    const innerBottomPad = 'calc(72px + var(--safe-bottom) + 52px)';

    return (
        <MyMenuLayoutContext.Provider value={layoutValue}>
            <div className="page fade-in" style={{ paddingBottom: 0, minHeight: '100dvh', background: '#FAFAFA' }}>
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
                        <MyMenuTabStrip shopSlug={shopSlug} activeTab={activeTab} menuId={menuId} listId={listId} />
                    </div>
                </div>

                <div style={{ paddingBottom: innerBottomPad }}>
                    {activeTab === 'dashboard' && <WeeklyMenuDashboardPage embedded />}
                    {activeTab === 'calendar' && (
                        <WeeklyCalendarPage embedded menuIdOverride={menuId ?? undefined} contentBottomPad={innerBottomPad} />
                    )}
                    {activeTab === 'planner' && (
                        <MenuPlannerPage embedded shopSlug={shopSlug} contentBottomPad={innerBottomPad} />
                    )}
                    {activeTab === 'shopping' && (
                        <ShoppingListPage embedded listIdOverride={listId || undefined} contentBottomPad={innerBottomPad} />
                    )}
                </div>
            </div>
        </MyMenuLayoutContext.Provider>
    );
}
