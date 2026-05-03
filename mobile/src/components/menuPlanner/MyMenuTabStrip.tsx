import { Link } from 'react-router-dom';
import type { MyMenuTab } from '../../context/MyMenuLayoutContext';

const GREEN = '#2E7D32';

const TABS: { id: MyMenuTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'shopping', label: 'Shopping list' },
    { id: 'planner', label: 'Menu planner' },
];

export function buildMyMenuHubPath(
    shopSlug: string,
    tab: MyMenuTab,
    opts?: { menuId?: string | null; listId?: string | null }
): string {
    const q = new URLSearchParams();
    q.set('tab', tab);
    if (opts?.menuId) q.set('menuId', opts.menuId);
    if (opts?.listId) q.set('listId', opts.listId);
    return `/${shopSlug}/my-menu?${q.toString()}`;
}

export type MyMenuTabStripProps = {
    shopSlug: string;
    activeTab: MyMenuTab;
    menuId?: string | null;
    listId?: string | null;
};

export default function MyMenuTabStrip({ shopSlug, activeTab, menuId, listId }: MyMenuTabStripProps) {
    return (
        <div
            style={{
                display: 'flex',
                gap: 4,
                overflowX: 'auto',
                paddingBottom: 10,
                WebkitOverflowScrolling: 'touch',
            }}
        >
            {TABS.map(({ id, label }) => (
                <Link
                    key={id}
                    to={buildMyMenuHubPath(shopSlug, id, { menuId, listId })}
                    replace
                    aria-current={activeTab === id ? 'page' : undefined}
                    style={{
                        flex: '0 0 auto',
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: 'none',
                        fontSize: 13,
                        fontWeight: activeTab === id ? 800 : 600,
                        background: activeTab === id ? 'rgba(46, 125, 50, 0.15)' : '#f0f0f0',
                        color: activeTab === id ? GREEN : '#555',
                        textDecoration: 'none',
                    }}
                >
                    {label}
                </Link>
            ))}
        </div>
    );
}
