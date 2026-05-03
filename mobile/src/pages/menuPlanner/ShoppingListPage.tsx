import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { menuPlannerApi } from '../../api';
import { useApp, type CartItem } from '../../context/AppContext';
import { useMyMenuLayout } from '../../context/MyMenuLayoutContext';
import MenuPlannerHeader from '../../components/menuPlanner/MenuPlannerHeader';
import { cacheShoppingList, getCachedShoppingList } from '../../services/menuPlannerCache';

const GREEN = '#2E7D32';
const AMBER = '#E65100';

const LABEL: Record<string, string> = {
    produce: 'PRODUCE',
    dairy_eggs: 'DAIRY & EGGS',
    meat: 'MEAT',
    spices: 'SPICES',
    pantry: 'PANTRY',
    other: 'OTHER',
};

function patchGroupList(groups: any[] | undefined, itemId: string, body: Record<string, unknown>) {
    if (!groups) return groups;
    return groups.map((g) => ({
        ...g,
        items: g.items.map((it: any) => (it.id === itemId ? { ...it, ...body } : it)),
    }));
}

function patchFlat(items: any[] | undefined, itemId: string, body: Record<string, unknown>) {
    if (!items) return items;
    return items.map((it) => (it.id === itemId ? { ...it, ...body } : it));
}

export type ShoppingListPageProps = {
    embedded?: boolean;
    listIdOverride?: string;
    contentBottomPad?: string;
};

export default function ShoppingListPage({ embedded = false, listIdOverride, contentBottomPad }: ShoppingListPageProps) {
    const { shopSlug, listId: routeListId } = useParams();
    const listId = listIdOverride ?? routeListId;
    const navigate = useNavigate();
    const myMenu = useMyMenuLayout();
    const { state, showToast, dispatch } = useApp();

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hideChecked, setHideChecked] = useState(false);

    const load = useCallback(async () => {
        if (!shopSlug || !listId || !state.isLoggedIn) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const d = await menuPlannerApi.getShoppingList(shopSlug, listId);
            setData(d);
            await cacheShoppingList(shopSlug, listId, d);
        } catch (e: any) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                const c = await getCachedShoppingList(shopSlug, listId);
                if (c?.payload) {
                    setData(c.payload);
                    showToast('Offline — saved list.');
                    setLoading(false);
                    return;
                }
            }
            showToast(e?.message || 'Could not load list');
        } finally {
            setLoading(false);
        }
    }, [shopSlug, listId, state.isLoggedIn, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const patchItem = async (itemId: string, body: { is_checked?: boolean; is_at_home?: boolean }) => {
        if (!shopSlug || !listId) return;
        const prev = data;
        if (prev) {
            setData({
                ...prev,
                groups: patchGroupList(prev.groups, itemId, body),
                groups_in_shop: patchGroupList(prev.groups_in_shop, itemId, body),
                groups_external_market: patchGroupList(prev.groups_external_market, itemId, body),
                in_shop_items: patchFlat(prev.in_shop_items, itemId, body),
                external_market_items: patchFlat(prev.external_market_items, itemId, body),
            });
        }
        try {
            await menuPlannerApi.patchShoppingItem(shopSlug, listId, itemId, body);
        } catch (e: any) {
            setData(prev);
            showToast(e?.message || 'Update failed');
        }
    };

    const addAllAvailableToCart = async () => {
        if (!shopSlug || !listId) return;
        try {
            const res = (await menuPlannerApi.addShoppingToCart(shopSlug, listId, { all: true })) as any;
            const lines = res?.added_to_cart ?? res?.items ?? [];
            const unavail = (res?.unavailable_items || []) as { reason?: string }[];
            const externalCnt = unavail.filter((u) => u.reason === 'external_market').length;

            const cartItems: CartItem[] = lines.map((row: any) => ({
                productId: row.product_id,
                name: row.product_name,
                sku: row.sku || '',
                price: Number(row.price),
                quantity: Math.max(1, Math.ceil(Number(row.quantity))),
                image_url: row.image_url || undefined,
                available_stock: Number(row.available_stock) || 0,
                tax_rate: Number(row.tax_rate) || 0,
            }));

            if (cartItems.length === 0 && externalCnt === 0) {
                showToast('Nothing to add. Check availability in shop.');
                return;
            }

            if (cartItems.length > 0) {
                dispatch({ type: 'MERGE_RECIPE_CART_ITEMS', lines: cartItems });
            }

            if (externalCnt > 0) {
                showToast(
                    'Some ingredients are not available in MyShop and must be purchased separately. Those appear under Buy from Local Market.'
                );
            } else if (cartItems.length > 0) {
                showToast('Added available items to cart');
            }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('menu-planner-analytics', {
                        detail: {
                            type: 'add_to_cart',
                            count: cartItems.length,
                            external_market_count: externalCnt,
                        },
                    })
                );
            }

            if (cartItems.length > 0) navigate(`/${shopSlug}/cart`);
        } catch (e: any) {
            showToast(e?.message || 'Could not add to cart');
        }
    };

    const exportMarketList = async () => {
        if (!shopSlug || !listId) return;
        try {
            const text = (await menuPlannerApi.getExternalMarketList(shopSlug, listId, true)) as string;
            const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `market-list-${listId.slice(0, 8)}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Market list downloaded');
        } catch (e: any) {
            showToast(e?.message || 'Export failed');
        }
    };

    const applyHideChecked = (groupsIn: any[] | undefined) => {
        const g = groupsIn || [];
        if (!hideChecked) return g;
        return g
            .map((x: any) => ({
                ...x,
                items: x.items.filter((it: any) => !it.is_checked),
            }))
            .filter((x: any) => x.items.length > 0);
    };

    const shopGroups = useMemo(() => applyHideChecked(data?.groups_in_shop), [data, hideChecked]);
    const marketGroups = useMemo(() => applyHideChecked(data?.groups_external_market), [data, hideChecked]);

    const flatItems = useMemo(() => {
        const out: any[] = [];
        for (const g of data?.groups || []) out.push(...g.items);
        return out;
    }, [data]);

    const checkedCount = flatItems.filter((i) => i.is_checked).length;
    const totalItems = flatItems.length;
    const pct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
    const est = data?.summary?.estimated_total ?? 0;
    const extCount = data?.summary?.external_market_count ?? 0;

    if (!shopSlug) return null;

    if (!listId) {
        if (embedded) {
            return (
                <div className="page fade-in" style={{ padding: 24, paddingBottom: 120, background: '#F6F6F8' }}>
                    <p style={{ marginBottom: 16, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        You don&apos;t have a shopping list yet. Open the Week tab and tap <strong>Generate Shopping List</strong> after you
                        add meals.
                    </p>
                    {myMenu && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ background: GREEN, width: '100%', maxWidth: 360 }}
                            onClick={() => myMenu.setTab('calendar')}
                        >
                            Go to week planner
                        </button>
                    )}
                </div>
            );
        }
        return null;
    }

    const renderItemRow = (it: any, opts: { external: boolean }) => (
        <div
            key={it.id}
            className="card"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 10px',
                marginBottom: 8,
                borderRadius: 10,
                opacity: it.is_checked ? 0.55 : 1,
                borderLeft: opts.external ? `4px solid ${AMBER}` : `4px solid ${GREEN}`,
                background: opts.external ? '#FFF8E1' : '#fff',
            }}
        >
            <input
                type="checkbox"
                checked={Boolean(it.is_checked)}
                onChange={(e) => patchItem(it.id, { is_checked: e.target.checked })}
                style={{ width: 22, height: 22, accentColor: GREEN }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div
                        style={{
                            fontWeight: 700,
                            textDecoration: it.is_checked ? 'line-through' : 'none',
                            color: it.is_checked ? 'var(--text-muted)' : '#1A1A1A',
                        }}
                    >
                        {opts.external && <span aria-hidden style={{ marginRight: 6 }}>🏪</span>}
                        {it.ingredient_name}
                    </div>
                    {opts.external ? (
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.4,
                                color: '#E65100',
                                background: 'rgba(230,81,0,0.12)',
                                padding: '3px 8px',
                                borderRadius: 6,
                            }}
                        >
                            Buy from Local Market
                        </span>
                    ) : (
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: GREEN,
                                background: 'rgba(46,125,50,0.1)',
                                padding: '3px 8px',
                                borderRadius: 6,
                            }}
                        >
                            Available in Shop
                        </span>
                    )}
                </div>
                {!opts.external && it.product_match_status === 'partial_match' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Partial catalog match</div>
                )}
                {opts.external && (
                    <div style={{ fontSize: 12, color: AMBER, marginTop: 4, fontWeight: 600 }}>
                        Not in MyShop catalog — purchase locally
                    </div>
                )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                — {it.quantity} {it.unit}
            </div>
            {!opts.external && (
                <button
                    type="button"
                    title="Already at home"
                    onClick={() => patchItem(it.id, { is_at_home: !it.is_at_home })}
                    style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 8,
                        border: it.is_at_home ? `1px solid ${GREEN}` : '1px solid var(--border)',
                        background: it.is_at_home ? 'rgba(46,125,50,0.12)' : '#fff',
                        color: '#333',
                    }}
                >
                    Home
                </button>
            )}
        </div>
    );

    return (
        <div className="page fade-in" style={{ paddingBottom: 120, background: '#F6F6F8' }}>
            {!embedded && <MenuPlannerHeader />}
            <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
                {embedded && myMenu ? (
                    <button
                        type="button"
                        style={{ fontSize: 14, color: GREEN, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        onClick={() => myMenu.setTab('dashboard')}
                    >
                        ← Dashboard
                    </button>
                ) : (
                    <Link to={`/${shopSlug}/menu-planner`} style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>
                        ← Dashboard
                    </Link>
                )}
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: '12px 0 4px' }}>Weekly List</h1>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        {data?.list?.generated_at
                            ? new Date(data.list.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : ''}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                        <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
                        HIDE CHECKED
                    </label>
                </div>

                {extCount > 0 && (
                    <div
                        className="card"
                        style={{
                            padding: 12,
                            marginBottom: 14,
                            borderRadius: 12,
                            border: `1px solid ${AMBER}`,
                            background: '#FFFDE7',
                            fontSize: 13,
                            lineHeight: 1.45,
                        }}
                    >
                        <strong>{extCount}</strong> ingredient{extCount === 1 ? '' : 's'} must be bought from the local market (not in MyShop).
                        <button
                            type="button"
                            onClick={exportMarketList}
                            style={{
                                display: 'block',
                                marginTop: 10,
                                fontWeight: 700,
                                color: AMBER,
                                background: 'none',
                                border: 'none',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            Download market shopping list (txt)
                        </button>
                    </div>
                )}

                {loading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <div style={{ background: 'rgba(46,125,50,0.12)', borderRadius: 14, padding: 14 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: '#1B5E20' }}>COMPLETION</div>
                                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>
                                    {checkedCount} / {totalItems} items
                                </div>
                                <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)' }}>
                                    <div style={{ width: `${pct}%`, background: GREEN, height: '100%', borderRadius: 3 }} />
                                </div>
                            </div>
                            <div style={{ background: 'rgba(126,87,194,0.15)', borderRadius: 14, padding: 14 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: '#5E35B1' }}>EST. COST (MYSHOP)</div>
                                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>Rs. {Number(est).toLocaleString()}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>In-stock items only</div>
                            </div>
                        </div>

                        <h2 style={{ fontSize: 15, fontWeight: 900, margin: '20px 0 10px', color: '#1A1A1A' }}>
                            Available from MyShop
                        </h2>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                            These map to products you can add to your MyShop cart.
                        </p>
                        {shopGroups.length === 0 ? (
                            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>No in-catalog items (or all hidden).</p>
                        ) : (
                            shopGroups.map((g: any) => (
                                <section key={`s-${g.category}`} style={{ marginBottom: 22 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5, marginBottom: 10 }}>
                                        {LABEL[g.category] || g.label} ({g.item_count} ITEMS)
                                    </h3>
                                    {g.items.map((it: any) => renderItemRow(it, { external: false }))}
                                </section>
                            ))
                        )}

                        <h2 style={{ fontSize: 15, fontWeight: 900, margin: '24px 0 10px', color: AMBER }}>
                            Buy from Local Market
                        </h2>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                            Not available in MyShop inventory — shop at your bazaar or preferred vendor.
                        </p>
                        {marketGroups.length === 0 ? (
                            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Everything on this list is available from MyShop.</p>
                        ) : (
                            marketGroups.map((g: any) => (
                                <section key={`m-${g.category}`} style={{ marginBottom: 22 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5, marginBottom: 10 }}>
                                        {LABEL[g.category] || g.label} ({g.item_count} ITEMS)
                                    </h3>
                                    {g.items.map((it: any) => renderItemRow(it, { external: true }))}
                                </section>
                            ))
                        )}
                    </>
                )}
            </div>

            <div
                style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: contentBottomPad ?? 'calc(56px + var(--safe-bottom))',
                    padding: '12px 16px',
                    background: 'linear-gradient(180deg, transparent, #F6F6F8 40%)',
                    zIndex: 30,
                }}
            >
                <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', background: GREEN, fontWeight: 800, padding: '14px', borderRadius: 12 }}
                    onClick={addAllAvailableToCart}
                >
                    🛒 Add All Available Items (MyShop)
                </button>
            </div>
        </div>
    );
}
