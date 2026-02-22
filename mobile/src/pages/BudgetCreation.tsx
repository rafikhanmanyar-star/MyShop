import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi, customerApi } from '../api';
import { useApp } from '../context/AppContext';

export default function BudgetCreation() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state } = useApp();

    const [search, setSearch] = useState('');
    const [products, setProducts] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [budgetType, setBudgetType] = useState<'Fixed' | 'Flexible'>('Flexible');

    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`);
            return;
        }

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
                            total: parseFloat(i.planned_total)
                        })));
                        setBudgetType(detail.budget_type);
                    }
                });
            }
        }).catch(() => { });
    }, [state.isLoggedIn, shopSlug]);

    useEffect(() => {
        if (search.length < 2) {
            setProducts([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await publicApi.getProducts(shopSlug!, { search, limit: '10' });
                setProducts(res.items || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [search, shopSlug]);

    const addItem = (p: any) => {
        if (selectedItems.find(item => item.productId === p.id)) return;

        const newItem = {
            productId: p.id,
            name: p.name,
            price: p.price,
            quantity: 1,
            total: p.price
        };
        setSelectedItems([...selectedItems, newItem]);
        setSearch('');
        setProducts([]);
    };

    const updateQuantity = (productId: string, q: number) => {
        const newItems = selectedItems.map(item => {
            if (item.productId === productId) {
                const newQ = Math.max(0.1, q);
                return { ...item, quantity: newQ, total: item.price * newQ };
            }
            return item;
        });
        setSelectedItems(newItems);
    };

    const removeItem = (productId: string) => {
        setSelectedItems(selectedItems.filter(i => i.productId !== productId));
    };

    const totalBudget = selectedItems.reduce((acc, i) => acc + i.total, 0);

    const handleSave = async () => {
        if (selectedItems.length === 0) return;
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
            navigate(`/${shopSlug}/budget`);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    const getMonthName = (m: number) => {
        return new Date(2000, m - 1).toLocaleString('default', { month: 'long' });
    };

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800 }}>Create Budget</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Planning for {getMonthName(month)} {year}
                </p>
            </div>

            <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: 16, border: '1px solid var(--border)', marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Budget Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={() => setBudgetType('Flexible')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                            background: budgetType === 'Flexible' ? 'var(--primary)' : '#F3F4F6',
                            color: budgetType === 'Flexible' ? 'white' : 'var(--text-main)',
                            border: 'none', cursor: 'pointer'
                        }}
                    >Flexible</button>
                    <button
                        onClick={() => setBudgetType('Fixed')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                            background: budgetType === 'Fixed' ? 'var(--primary)' : '#F3F4F6',
                            color: budgetType === 'Fixed' ? 'white' : 'var(--text-main)',
                            border: 'none', cursor: 'pointer'
                        }}
                    >Fixed</button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    {budgetType === 'Flexible' ? 'Allows editing budget anytime.' : 'Locks the budget once the month starts.'}
                </p>
            </div>

            <div style={{ position: 'relative', marginBottom: 24 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, background: 'white', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', padding: '4px 12px'
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <input
                        type="text"
                        placeholder="Search products to add..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ border: 'none', padding: '12px 0', width: '100%', outline: 'none', fontSize: 14 }}
                    />
                </div>

                {products.length > 0 && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', zIndex: 10,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', borderRadius: 'var(--radius-lg)', marginTop: 8,
                        maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)'
                    }}>
                        {products.map(p => (
                            <div key={p.id} onClick={() => addItem(p)} style={{
                                padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rs. {p.price} / {p.unit}</div>
                                </div>
                                <div style={{ color: 'var(--primary)', fontSize: 20 }}>+</div>
                            </div>
                        ))}
                    </div>
                )}
                {loading && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', padding: 16, textAlign: 'center', fontSize: 13, borderRadius: 'var(--radius-lg)', marginTop: 8, border: '1px solid var(--border)' }}>
                        Searching...
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedItems.length > 0 ? selectedItems.map(item => (
                    <div key={item.productId} style={{
                        background: 'white', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Rs. {item.price.toLocaleString()} x {item.quantity} = <strong>Rs. {item.total.toLocaleString()}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 'var(--radius-full)', padding: 4 }}>
                                <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>-</button>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(item.productId, parseFloat(e.target.value))}
                                    style={{ width: 40, border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700, fontSize: 14 }}
                                />
                                <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>+</button>
                            </div>
                            <button onClick={() => removeItem(item.productId)} style={{ border: 'none', background: 'transparent', color: '#EF4444' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                            </button>
                        </div>
                    </div>
                )) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--border)', borderRadius: 'var(--radius-xl)', color: 'var(--text-muted)' }}>
                        Add products from the search bar above to build your budget.
                    </div>
                )}
            </div>

            {/* Bottom Bar */}
            <div style={{
                position: 'fixed', bottom: 70, left: 0, right: 0, padding: '16px 20px', background: 'white',
                borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 -4px 15px rgba(0,0,0,0.05)', zIndex: 100
            }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Monthly Budget</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>Rs. {totalBudget.toLocaleString()}</div>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={selectedItems.length === 0 || saving}
                    onClick={handleSave}
                    style={{ padding: '12px 30px' }}
                >
                    {saving ? 'Saving...' : 'Save Budget'}
                </button>
            </div>
        </div>
    );
}
