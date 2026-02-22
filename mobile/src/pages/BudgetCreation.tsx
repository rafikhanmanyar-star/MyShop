import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi, customerApi, getFullImageUrl } from '../api';
import { useApp } from '../context/AppContext';

export default function BudgetCreation() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    // View state: 'browse' (explore products) or 'review' (see selected budget items)
    const [view, setView] = useState<'browse' | 'review'>('browse');

    // Browse state
    const [search, setSearch] = useState('');
    const [categories, setCategories] = useState<any[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('');
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Budget items state
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [budgetType, setBudgetType] = useState<'Fixed' | 'Flexible'>('Flexible');

    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    // 1. Initial Data Load (Auth & Existing Budget)
    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`);
            return;
        }

        // Load categories for browsing
        publicApi.getCategories(shopSlug!).then(setCategories).catch(() => { });

        // Load existing budget if any to edit
        customerApi.getBudgetSummary(month, year).then(summary => {
            if (summary && summary.budgetId) {
                customerApi.getBudget(summary.budgetId).then(detail => {
                    if (detail && detail.items) {
                        setSelectedItems(detail.items.map((i: any) => ({
                            productId: i.product_id,
                            name: i.product_name,
                            price: parseFloat(i.planned_price),
                            quantity: parseFloat(i.planned_quantity),
                            total: parseFloat(i.planned_total),
                            image_url: i.image_url,
                            sku: i.sku
                        })));
                        setBudgetType(detail.budget_type);
                    }
                });
            }
        }).catch(() => { });
    }, [state.isLoggedIn, shopSlug]);

    // 2. Product Loading Logic (similar to Products.tsx)
    const loadProducts = useCallback(async (reset = false) => {
        if (!shopSlug) return;
        const params: Record<string, string> = { limit: '20' };
        if (activeCategory) params.category = activeCategory;
        if (search) params.search = search;
        if (!reset && cursor) params.cursor = cursor;

        if (reset) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await publicApi.getProducts(shopSlug, params);
            if (reset) {
                setProducts(data.items);
            } else {
                setProducts(prev => [...prev, ...data.items]);
            }
            setCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch (err: any) {
            showToast(err.message || 'Failed to load products');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [shopSlug, activeCategory, search, cursor]);

    // Refresh products when filters change
    useEffect(() => {
        setCursor(null);
        loadProducts(true);
    }, [activeCategory, search]);

    // 3. Selection Handlers
    const addItem = (p: any) => {
        if (selectedItems.find(item => item.productId === p.id)) {
            // If already added, maybe increment quantity?
            updateQuantity(p.id, (selectedItems.find(i => i.productId === p.id).quantity || 0) + 1);
            showToast(`Increased quantity for ${p.name}`);
            return;
        }

        const newItem = {
            productId: p.id,
            name: p.name,
            price: p.price,
            quantity: 1,
            total: p.price,
            image_url: p.image_url,
            sku: p.sku
        };
        setSelectedItems([...selectedItems, newItem]);
        showToast(`${p.name} added to budget`);
    };

    const updateQuantity = (productId: string, q: number) => {
        const newItems = selectedItems.map(item => {
            if (item.productId === productId) {
                const newQ = Math.max(0, q); // Allow 0 to remove? Let's keep 0.1 min for budget
                const clampedQ = newQ < 0.1 && newQ > 0 ? 0.1 : newQ;
                return { ...item, quantity: clampedQ, total: item.price * clampedQ };
            }
            return item;
        }).filter(item => item.quantity > 0);
        setSelectedItems(newItems);
    };

    const removeItem = (productId: string) => {
        setSelectedItems(selectedItems.filter(i => i.productId !== productId));
    };

    const totalBudget = selectedItems.reduce((acc, i) => acc + i.total, 0);

    const handleSave = async () => {
        if (selectedItems.length === 0) {
            showToast('Please add at least one product');
            return;
        }
        setSaving(true);
        try {
            await customerApi.createBudget({
                month,
                year,
                type: budgetType,
                items: selectedItems.map(i => ({
                    productId: i.productId,
                    plannedQuantity: i.quantity,
                    plannedPrice: i.price
                }))
            });
            showToast('Budget saved successfully');
            navigate(`/${shopSlug}/budget`);
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setSaving(false);
        }
    };

    const formatPrice = (p: any) => {
        const num = parseFloat(p);
        if (isNaN(num)) return 'Rs. 0';
        return `Rs. ${num.toLocaleString()}`;
    };

    const getMonthName = (m: number) => {
        return new Date(2000, m - 1).toLocaleString('default', { month: 'long' });
    };

    return (
        <div className="page fade-in" style={{ paddingBottom: 120 }}>
            {/* Header Area */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: 0 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <h1 style={{ fontSize: 24, fontWeight: 800 }}>Create Budget</h1>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginLeft: 36 }}>
                    Planning for {getMonthName(month)} {year}
                </p>
            </div>

            {/* View Toggle Tabs */}
            <div style={{
                display: 'flex', background: 'white', borderRadius: 'var(--radius-lg)', padding: 4,
                border: '1px solid var(--border)', marginBottom: 20
            }}>
                <button
                    onClick={() => setView('browse')}
                    style={{
                        flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600,
                        background: view === 'browse' ? 'var(--primary)' : 'transparent',
                        color: view === 'browse' ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.2s'
                    }}
                >Explore Products</button>
                <button
                    onClick={() => setView('review')}
                    style={{
                        flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600,
                        background: view === 'review' ? 'var(--primary)' : 'transparent',
                        color: view === 'review' ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                >
                    Review Budget
                    {selectedItems.length > 0 && <span style={{
                        background: view === 'review' ? 'rgba(255,255,255,0.3)' : 'var(--primary)',
                        color: 'white', fontSize: 10, padding: '2px 8px', borderRadius: 10
                    }}>{selectedItems.length}</span>}
                </button>
            </div>

            {view === 'browse' ? (
                /* ─── PRODUCT EXPLORER MODE ─── */
                <div>
                    {/* Search Bar */}
                    <div className="search-bar" style={{ marginBottom: 16 }}>
                        <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        <input
                            type="search"
                            placeholder="Search products to add..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Category Pills */}
                    {categories.length > 0 && (
                        <div className="category-pills" style={{ marginBottom: 16 }}>
                            <button
                                className={`category-pill ${!activeCategory ? 'active' : ''}`}
                                onClick={() => setActiveCategory('')}
                            >All Items</button>
                            {categories.map((c: any) => (
                                <button
                                    key={c.id}
                                    className={`category-pill ${activeCategory === c.id ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(c.id)}
                                >{c.name}</button>
                            ))}
                        </div>
                    )}

                    {/* Product Grid */}
                    {loading ? (
                        <div className="product-grid">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="product-card">
                                    <div className="skeleton" style={{ aspectRatio: '1' }} />
                                    <div style={{ padding: 12 }}>
                                        <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                                        <div className="skeleton" style={{ height: 18, width: '50%' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="empty-state" style={{ minHeight: '30vh' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            <h3 style={{ fontSize: 16 }}>No products found</h3>
                        </div>
                    ) : (
                        <>
                            <div className="product-grid">
                                {products.map((p: any) => {
                                    const inBudget = selectedItems.find(i => i.productId === p.id);
                                    return (
                                        <div key={p.id} className="product-card">
                                            <div className="image-wrap">
                                                {p.image_url ? (
                                                    <img src={getFullImageUrl(p.image_url)} alt={p.name} loading="lazy" />
                                                ) : (
                                                    <svg className="placeholder-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                                )}
                                            </div>
                                            <div className="info">
                                                <div className="name" style={{ marginBottom: 2 }}>{p.name}</div>
                                                <div className="price" style={{ fontSize: 14 }}>{formatPrice(p.price)}</div>
                                            </div>
                                            <button
                                                className="add-btn"
                                                onClick={() => addItem(p)}
                                                style={{
                                                    background: inBudget ? 'var(--accent)' : 'var(--primary)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                                }}
                                            >
                                                {inBudget ? (
                                                    <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Added ({inBudget.quantity})</>
                                                ) : '+ Add to Budget'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            {hasMore && (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => loadProducts(false)}
                                        disabled={loadingMore}
                                    >
                                        {loadingMore ? 'Loading...' : 'Load More'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : (
                /* ─── REVIEW MODE ─── */
                <div className="fade-in">
                    {/* Budget Type Selector */}
                    <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: 16, border: '1px solid var(--border)', marginBottom: 20 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Budget Rules</label>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setBudgetType('Flexible')}
                                className={budgetType === 'Flexible' ? 'btn btn-primary' : 'btn btn-outline'}
                                style={{ flex: 1, fontSize: 13, padding: '10px' }}
                            >Flexible</button>
                            <button
                                onClick={() => setBudgetType('Fixed')}
                                className={budgetType === 'Fixed' ? 'btn btn-primary' : 'btn btn-outline'}
                                style={{ flex: 1, fontSize: 13, padding: '10px' }}
                            >Fixed</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {selectedItems.length > 0 ? selectedItems.map(item => (
                            <div key={item.productId} className="card" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 8, background: '#F1F5F9', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {item.image_url ? <img src={getFullImageUrl(item.image_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛒'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatPrice(item.price)} per unit</div>
                                    </div>
                                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{formatPrice(item.total)}</div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 'var(--radius-full)', padding: 4 }}>
                                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800 }}>-</button>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(item.productId, parseFloat(e.target.value))}
                                            style={{ width: 50, border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700 }}
                                        />
                                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800 }}>+</button>
                                    </div>
                                    <button onClick={() => removeItem(item.productId)} style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>Remove</button>
                                </div>
                            </div>
                        )) : (
                            <div className="empty-state" style={{ background: '#F8FAFC', borderRadius: 'var(--radius-xl)' }}>
                                <p>You haven't added any products to your budget yet.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => setView('browse')}>Start Browsing</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sticky Bottom Bar */}
            <div style={{
                position: 'fixed', bottom: 70, left: 0, right: 0, padding: '16px 20px', background: 'white',
                borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 -4px 15px rgba(0,0,0,0.05)', zIndex: 100
            }}>
                <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Total</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{formatPrice(totalBudget)}</div>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={selectedItems.length === 0 || saving}
                    onClick={handleSave}
                    style={{ padding: '12px 28px', minWidth: 140 }}
                >
                    {saving ? 'Saving...' : 'Save Budget'}
                </button>
            </div>
        </div>
    );
}
