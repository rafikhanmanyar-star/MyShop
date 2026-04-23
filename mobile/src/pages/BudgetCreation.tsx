import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi, customerApi, getProductImagePath } from '../api';
import { filterCategoriesWithListedProducts } from '../utils/catalogCategories';
import CachedImage from '../components/CachedImage';
import { useApp } from '../context/AppContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type CreationMode = 'quick' | 'manual' | 'clone';

interface BudgetItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
    image_url?: string;
    sku?: string;
    isFrequent?: boolean;
    lastMonthQty?: number;
    isSuggested?: boolean;
}

export default function BudgetCreation() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const [searchParams] = useSearchParams();

    const paramMode = searchParams.get('mode') as CreationMode | null;
    const paramMonth = parseInt(searchParams.get('month') || '') || (new Date().getMonth() + 1);
    const paramYear = parseInt(searchParams.get('year') || '') || new Date().getFullYear();

    const [mode, setMode] = useState<CreationMode>(paramMode || 'quick');
    const [view, setView] = useState<'setup' | 'browse' | 'review'>(paramMode === 'manual' ? 'browse' : 'setup');

    // Budget target (from query string; read-only for this flow)
    const month = paramMonth;
    const year = paramYear;

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
    const [selectedItems, setSelectedItems] = useState<BudgetItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [budgetType, setBudgetType] = useState<'Fixed' | 'Flexible'>('Flexible');

    // Suggestions state
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);

    // Clone state
    const [previousBudgets, setPreviousBudgets] = useState<any[]>([]);
    const [selectedCloneId, setSelectedCloneId] = useState<string | null>(null);
    const [cloneLoading, setCloneLoading] = useState(false);

    // Existing budget (edit mode)
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`);
            return;
        }
        publicApi
            .getCategories(shopSlug!)
            .then((raw) =>
                setCategories(Array.isArray(raw) ? raw : (raw as any)?.categories ?? []),
            )
            .catch(() => {});
        loadExistingBudget();
    }, [state.isLoggedIn, shopSlug]);

    useEffect(() => {
        if (mode === 'quick' && !suggestionsLoaded) {
            loadSuggestions();
        } else if (mode === 'clone') {
            loadPreviousBudgets();
        }
    }, [mode]);

    const loadExistingBudget = async () => {
        try {
            const summary = await customerApi.getBudgetSummary(month, year);
            if (summary?.budgetId) {
                const detail = await customerApi.getBudget(summary.budgetId);
                const withQty = (detail?.items || []).filter(
                    (i: any) => parseFloat(i.planned_quantity) > 0,
                );
                if (withQty.length) {
                    setSelectedItems(withQty.map((i: any) => ({
                        productId: i.product_id,
                        name: i.product_name,
                        price: parseFloat(i.planned_price),
                        quantity: parseFloat(i.planned_quantity),
                        total: parseFloat(i.planned_total),
                        image_url: i.image_url,
                        sku: i.product_sku,
                    })));
                    setBudgetType(detail.budget_type);
                    setIsEditing(true);
                    setView('review');
                }
            }
        } catch {}
    };

    const loadSuggestions = async () => {
        setSuggestionsLoading(true);
        try {
            const data = await customerApi.getBudgetSuggestions(month, year);
            const sugg = (data.suggestions || []).filter(
                (s: any) => Number(s.suggested_qty) > 0,
            );
            setSuggestions(sugg);
            setSuggestionsLoaded(true);
            if (sugg.length && selectedItems.length === 0) {
                setSelectedItems(sugg.map((s: any) => ({
                    productId: s.product_id,
                    name: s.product_name,
                    price: s.retail_price,
                    quantity: s.suggested_qty,
                    total: s.suggested_amount,
                    image_url: s.image_url,
                    sku: s.product_sku,
                    isFrequent: s.is_frequent,
                    lastMonthQty: s.last_month_qty,
                    isSuggested: true,
                })));
            }
        } catch {
            showToast('Could not load suggestions');
        } finally {
            setSuggestionsLoading(false);
        }
    };

    const loadPreviousBudgets = async () => {
        try {
            const budgets = await customerApi.getBudgets();
            setPreviousBudgets(budgets.filter((b: any) => !(b.month === month && b.year === year)));
        } catch {}
    };

    const budgetCategoriesForPills = useMemo(
        () => filterCategoriesWithListedProducts(categories, null),
        [categories],
    );

    useEffect(() => {
        if (!activeCategory) return;
        if (!budgetCategoriesForPills.some((c: any) => c.id === activeCategory)) {
            setActiveCategory('');
        }
    }, [activeCategory, budgetCategoriesForPills]);

    const handleCloneSelect = async (budgetId: string) => {
        setSelectedCloneId(budgetId);
        setCloneLoading(true);
        try {
            const detail = await customerApi.getBudget(budgetId);
            const withQty = (detail?.items || []).filter(
                (i: any) => parseFloat(i.planned_quantity) > 0,
            );
            if (withQty.length) {
                setSelectedItems(withQty.map((i: any) => ({
                    productId: i.product_id,
                    name: i.product_name,
                    price: parseFloat(i.planned_price),
                    quantity: parseFloat(i.planned_quantity),
                    total: parseFloat(i.planned_total),
                    image_url: i.image_url,
                    sku: i.product_sku,
                })));
                setBudgetType(detail.budget_type);
                setView('review');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to load budget');
        } finally {
            setCloneLoading(false);
        }
    };

    // Product loading
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
            if (reset) setProducts(data.items);
            else setProducts(prev => [...prev, ...data.items]);
            setCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch (err: any) {
            showToast(err.message || 'Failed to load products');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [shopSlug, activeCategory, search, cursor]);

    useEffect(() => {
        if (view === 'browse') {
            setCursor(null);
            loadProducts(true);
        }
    }, [activeCategory, search, view]);

    const addItem = (p: any) => {
        const existing = selectedItems.find(item => item.productId === p.id);
        if (existing) {
            updateQuantity(p.id, existing.quantity + 1);
            showToast(`Increased quantity for ${p.name}`);
            return;
        }
        setSelectedItems([...selectedItems, {
            productId: p.id,
            name: p.name,
            price: p.price,
            quantity: 1,
            total: p.price,
            image_url: getProductImagePath(p),
            sku: p.sku,
        }]);
        showToast(`${p.name} added to budget`);
    };

    const updateQuantity = (productId: string, q: number) => {
        const newQ = Math.max(0, isNaN(q) ? 0 : q);
        if (newQ === 0) {
            setSelectedItems((prev) => prev.filter((i) => i.productId !== productId));
            return;
        }
        setSelectedItems((prev) =>
            prev.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: newQ, total: item.price * newQ }
                    : item,
            ),
        );
    };

    const removeItem = (productId: string) => {
        setSelectedItems(selectedItems.filter(i => i.productId !== productId));
    };

    const totalBudget = selectedItems.reduce((acc, i) => acc + i.total, 0);

    const handleSave = async () => {
        const lineItems = selectedItems.filter((i) => i.quantity > 0);
        if (lineItems.length === 0) {
            showToast('Please add at least one product');
            return;
        }
        setSaving(true);
        try {
            await customerApi.createBudget({
                month, year, type: budgetType,
                items: lineItems.map((i) => ({
                    productId: i.productId,
                    plannedQuantity: i.quantity,
                    plannedPrice: i.price,
                })),
            });
            showToast('Budget saved successfully!');
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
        return `Rs. ${Math.round(num).toLocaleString()}`;
    };

    const renderModeSelector = () => (
        <div style={{
            display: 'flex', background: '#F1F5F9', borderRadius: 'var(--radius-lg)', padding: 4, marginBottom: 20,
        }}>
            {([
                { key: 'quick' as const, label: 'Quick', icon: '⚡' },
                { key: 'manual' as const, label: 'Manual', icon: '📝' },
                { key: 'clone' as const, label: 'Clone', icon: '📋' },
            ]).map(({ key, label, icon }) => (
                <button key={key} onClick={() => { setMode(key); if (key === 'manual') setView('browse'); else setView('setup'); }}
                    style={{
                        flex: 1, padding: '10px 8px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                        background: mode === key ? 'white' : 'transparent',
                        color: mode === key ? 'var(--primary)' : 'var(--text-secondary)',
                        boxShadow: mode === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s', border: 'none', cursor: 'pointer',
                    }}
                >{icon} {label}</button>
            ))}
        </div>
    );

    const renderQuickSetup = () => (
        <div className="fade-in">
            {suggestionsLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
                    <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
                    <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
                </div>
            ) : suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No purchase history found</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                        We need purchase data to auto-generate your budget. Try creating one manually instead.
                    </p>
                    <button className="btn btn-primary" onClick={() => { setMode('manual'); setView('browse'); }}>
                        Create Manually
                    </button>
                </div>
            ) : (
                <>
                    {/* Info Banner */}
                    <div style={{
                        background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 'var(--radius-lg)',
                        padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1D4ED8',
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <span style={{ fontSize: 18 }}>💡</span>
                        <span>Auto-generated with +10% buffer based on last month's purchases. Edit quantities below.</span>
                    </div>

                    {/* Suggested Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {selectedItems.map(item => (
                            <div key={item.productId} style={{
                                background: 'white', borderRadius: 'var(--radius-lg)', padding: 14,
                                border: item.isFrequent ? '1.5px solid #A7F3D0' : '1px solid var(--border)',
                            }}>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 10, background: '#F1F5F9',
                                        flexShrink: 0, overflow: 'hidden',
                                    }}>
                                        <CachedImage path={item.image_url} alt={item.name} fallbackLabel={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {formatPrice(item.price)} / unit
                                                    {item.lastMonthQty ? ` · Last: ${item.lastMonthQty}` : ''}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 14, whiteSpace: 'nowrap' }}>
                                                {formatPrice(item.total)}
                                            </div>
                                        </div>
                                        {item.isFrequent && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, color: '#059669', background: '#ECFDF5',
                                                padding: '2px 8px', borderRadius: 'var(--radius-full)', display: 'inline-block', marginTop: 4,
                                            }}>Frequently Purchased</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 'var(--radius-full)', padding: 3 }}>
                                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800, cursor: 'pointer' }}>−</button>
                                        <input type="number" value={item.quantity} aria-label={`Quantity for ${item.name}`}
                                            onChange={e => updateQuantity(item.productId, parseFloat(e.target.value))}
                                            style={{ width: 50, border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700, fontSize: 14 }}
                                        />
                                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800, cursor: 'pointer' }}>+</button>
                                    </div>
                                    <button onClick={() => removeItem(item.productId)}
                                        style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                                    >Remove</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add More */}
                    <button onClick={() => setView('browse')}
                        style={{
                            width: '100%', marginTop: 16, padding: '14px', borderRadius: 'var(--radius-lg)',
                            border: '2px dashed var(--border)', background: 'white', fontSize: 14, fontWeight: 600,
                            color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 8,
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Add More Items
                    </button>
                </>
            )}
        </div>
    );

    const renderCloneSetup = () => (
        <div className="fade-in">
            {previousBudgets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No previous budgets</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                        You don't have any previous budgets to clone.
                    </p>
                    <button className="btn btn-primary" onClick={() => { setMode('manual'); setView('browse'); }}>
                        Create Manually
                    </button>
                </div>
            ) : (
                <>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Select a previous budget to use as a template.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {previousBudgets.map((b: any) => (
                            <button key={b.id} onClick={() => handleCloneSelect(b.id)}
                                disabled={cloneLoading}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: selectedCloneId === b.id ? '#EEF2FF' : 'white',
                                    padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                                    border: selectedCloneId === b.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    textAlign: 'left', cursor: 'pointer', width: '100%',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                                        {MONTH_NAMES[b.month - 1]} {b.year}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {formatPrice(b.total_budget_amount)} · {b.budget_type}
                                    </div>
                                </div>
                                {selectedCloneId === b.id && cloneLoading ? (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading...</span>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );

    const renderBrowse = () => (
        <div className="fade-in">
            <div className="search-bar" style={{ marginBottom: 16 }}>
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input type="search" placeholder="Search products to add..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {budgetCategoriesForPills.length > 0 && (
                <div className="category-pills" style={{ marginBottom: 16 }}>
                    <button className={`category-pill ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory('')}>All</button>
                    {budgetCategoriesForPills.map((c: any) => (
                        <button key={c.id} className={`category-pill ${activeCategory === c.id ? 'active' : ''}`}
                            onClick={() => setActiveCategory(c.id)}>{c.name}</button>
                    ))}
                </div>
            )}

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
                                        <CachedImage path={getProductImagePath(p)} alt={p.name} loading="lazy" fallbackLabel={p.name} />
                                    </div>
                                    <div className="info">
                                        <div className="name" style={{ marginBottom: 2 }}>{p.name}</div>
                                        <div className="price" style={{ fontSize: 14 }}>{formatPrice(p.price)}</div>
                                    </div>
                                    <button className="add-btn" onClick={() => addItem(p)}
                                        style={{
                                            background: inBudget ? 'var(--accent)' : 'var(--primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        }}
                                    >
                                        {inBudget ? (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                Added ({inBudget.quantity})
                                            </>
                                        ) : '+ Add'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {hasMore && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => loadProducts(false)} disabled={loadingMore}>
                                {loadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    const renderReview = () => (
        <div className="fade-in">
            {/* Budget Type */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)', padding: 14,
                border: '1px solid var(--border)', marginBottom: 16,
            }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Budget Type
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                    {(['Flexible', 'Fixed'] as const).map(type => (
                        <button key={type} onClick={() => setBudgetType(type)}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                                background: budgetType === type ? 'var(--primary)' : 'transparent',
                                color: budgetType === type ? 'white' : 'var(--text-secondary)',
                                border: budgetType === type ? 'none' : '1px solid var(--border)',
                                cursor: 'pointer',
                            }}
                        >{type}</button>
                    ))}
                </div>
            </div>

            {/* Item count & total */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', marginBottom: 8,
            }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {selectedItems.length} items
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>
                    Total: {formatPrice(totalBudget)}
                </span>
            </div>

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedItems.length > 0 ? selectedItems.map(item => (
                    <div key={item.productId} style={{
                        background: 'white', borderRadius: 'var(--radius-lg)', padding: 14,
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F1F5F9', flexShrink: 0, overflow: 'hidden' }}>
                                <CachedImage path={item.image_url} alt={item.name} fallbackLabel={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{formatPrice(item.price)} / unit</div>
                            </div>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 14 }}>{formatPrice(item.total)}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 'var(--radius-full)', padding: 3 }}>
                                <button onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800, cursor: 'pointer' }}>−</button>
                                <input type="number" value={item.quantity} aria-label={`Quantity for ${item.name}`}
                                    onChange={e => updateQuantity(item.productId, parseFloat(e.target.value))}
                                    style={{ width: 50, border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700, fontSize: 14 }}
                                />
                                <button onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'white', fontWeight: 800, cursor: 'pointer' }}>+</button>
                            </div>
                            <button onClick={() => removeItem(item.productId)}
                                style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                            >Remove</button>
                        </div>
                    </div>
                )) : (
                    <div className="empty-state" style={{ background: '#F8FAFC', borderRadius: 'var(--radius-xl)', padding: 30 }}>
                        <p style={{ marginBottom: 12 }}>No products added yet.</p>
                        <button className="btn btn-primary btn-sm" onClick={() => setView('browse')}>Browse Products</button>
                    </div>
                )}
            </div>

            {selectedItems.length > 0 && (
                <button onClick={() => setView('browse')}
                    style={{
                        width: '100%', marginTop: 16, padding: '12px', borderRadius: 'var(--radius-lg)',
                        border: '2px dashed var(--border)', background: 'white', fontSize: 13, fontWeight: 600,
                        color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 8,
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add More Items
                </button>
            )}
        </div>
    );

    return (
        <div className="page fade-in" style={{ paddingBottom: 160 }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <button title="Go back" onClick={() => {
                        if (view === 'browse' && (mode === 'quick' || mode === 'clone')) { setView('setup'); return; }
                        if (view === 'browse' && mode === 'manual' && selectedItems.length > 0) { setView('review'); return; }
                        navigate(-1);
                    }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800 }}>
                            {isEditing ? 'Edit Budget' : 'Create Budget'}
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            {MONTH_NAMES[month - 1]} {year}
                        </p>
                    </div>
                </div>
            </div>

            {/* Mode Selector (only on setup/browse views, not edit) */}
            {!isEditing && view !== 'review' && renderModeSelector()}

            {/* View Tabs (browse vs review for manual mode) */}
            {(view === 'browse' || view === 'review') && mode === 'manual' && (
                <div style={{
                    display: 'flex', background: '#F1F5F9', borderRadius: 'var(--radius-lg)', padding: 4, marginBottom: 20,
                }}>
                    <button onClick={() => setView('browse')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                            background: view === 'browse' ? 'white' : 'transparent',
                            color: view === 'browse' ? 'var(--text)' : 'var(--text-secondary)',
                            boxShadow: view === 'browse' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            border: 'none', cursor: 'pointer',
                        }}
                    >Browse</button>
                    <button onClick={() => setView('review')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                            background: view === 'review' ? 'white' : 'transparent',
                            color: view === 'review' ? 'var(--text)' : 'var(--text-secondary)',
                            boxShadow: view === 'review' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        Review
                        {selectedItems.length > 0 && (
                            <span style={{
                                background: view === 'review' ? 'var(--primary)' : 'var(--text-muted)',
                                color: 'white', fontSize: 10, padding: '2px 7px', borderRadius: 10,
                            }}>{selectedItems.length}</span>
                        )}
                    </button>
                </div>
            )}

            {/* Content */}
            {view === 'setup' && mode === 'quick' && renderQuickSetup()}
            {view === 'setup' && mode === 'clone' && renderCloneSetup()}
            {view === 'browse' && renderBrowse()}
            {view === 'review' && renderReview()}

            {/* Sticky Bottom Bar */}
            {selectedItems.length > 0 && (
                <div style={{
                    position: 'fixed', bottom: 'calc(64px + var(--safe-bottom))', left: 0, right: 0,
                    padding: '12px 20px', background: 'white', borderTop: '1px solid var(--border)',
                    boxShadow: '0 -4px 15px rgba(0,0,0,0.05)', zIndex: 100,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: view === 'browse' ? 8 : 0 }}>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {selectedItems.length} items · Monthly Budget
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{formatPrice(totalBudget)}</div>
                        </div>
                        {view === 'browse' ? (
                            <button className="btn btn-primary"
                                onClick={() => setView(mode === 'manual' ? 'review' : 'setup')}
                                style={{ padding: '10px 24px' }}
                            >
                                Review ({selectedItems.length})
                            </button>
                        ) : (
                            <button className="btn btn-primary" disabled={selectedItems.length === 0 || saving}
                                onClick={handleSave} style={{ padding: '12px 28px', minWidth: 130 }}
                            >
                                {saving ? 'Saving...' : isEditing ? 'Update Budget' : 'Save Budget'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
