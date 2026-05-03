import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MyMenuLayoutContext, type MyMenuTab } from '../context/MyMenuLayoutContext';
import WeeklyMenuDashboardPage from './menuPlanner/WeeklyMenuDashboardPage';
import WeeklyCalendarPage from './menuPlanner/WeeklyCalendarPage';
import ShoppingListPage from './menuPlanner/ShoppingListPage';

const GREEN = '#2E7D32';

const TABS: { id: MyMenuTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'shopping', label: 'Shopping list' },
    { id: 'configure', label: 'Menu items' },
];

function parseTab(s: string | null): MyMenuTab {
    if (s === 'calendar' || s === 'shopping' || s === 'configure' || s === 'dashboard') return s;
    return 'dashboard';
}

/** Hub: dashboard + week calendar + shopping list + meal configuration (embedded planner screens). */
export default function MyMenuPage() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();

    const tabFromUrl = parseTab(searchParams.get('tab'));
    const [menuId, setMenuId] = useState<string | null>(null);
    const listId = searchParams.get('listId');

    const activeTab = tabFromUrl;

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
                        <div
                            role="tablist"
                            style={{
                                display: 'flex',
                                gap: 4,
                                overflowX: 'auto',
                                paddingBottom: 10,
                                WebkitOverflowScrolling: 'touch',
                            }}
                        >
                            {TABS.map(({ id, label }) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === id ? 'true' : 'false'}
                                    onClick={() => setTab(id)}
                                    style={{
                                        flex: '0 0 auto',
                                        padding: '8px 12px',
                                        borderRadius: 999,
                                        border: 'none',
                                        fontSize: 13,
                                        fontWeight: activeTab === id ? 800 : 600,
                                        background: activeTab === id ? 'rgba(46, 125, 50, 0.15)' : '#f0f0f0',
                                        color: activeTab === id ? GREEN : '#555',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ paddingBottom: innerBottomPad }}>
                    {activeTab === 'dashboard' && <WeeklyMenuDashboardPage embedded />}
                    {activeTab === 'calendar' && (
                        <WeeklyCalendarPage embedded menuIdOverride={menuId ?? undefined} variant="full" contentBottomPad={innerBottomPad} />
                    )}
                    {activeTab === 'configure' && (
                        <WeeklyCalendarPage embedded menuIdOverride={menuId ?? undefined} variant="configure" contentBottomPad={innerBottomPad} />
                    )}
                    {activeTab === 'shopping' && (
                        <ShoppingListPage embedded listIdOverride={listId || undefined} contentBottomPad={innerBottomPad} />
                    )}
                </div>
            </div>
        </MyMenuLayoutContext.Provider>
    );
}
