import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { customerApi } from '../api';
import { useApp } from '../context/AppContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type FilterType = 'all' | 'exceeded' | 'within' | 'unused';

export default function BudgetDetail() {
    const { id, shopSlug } = useParams();
    const navigate = useNavigate();
    const { showToast } = useApp();
    const [budget, setBudget] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cloning, setCloning] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    const [showCloneModal, setShowCloneModal] = useState(false);

    useEffect(() => {
        loadBudget();
    }, [id, shopSlug]);

    const loadBudget = async () => {
        try {
            const data = await customerApi.getBudget(id!);
            setBudget(data);
        } catch (err) {
            console.error(err);
            navigate(`/${shopSlug}/budget`);
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (n: any) => {
        const val = parseFloat(n);
        if (isNaN(val)) return 'Rs. 0';
        return `Rs. ${Math.round(Math.abs(val)).toLocaleString()}`;
    };

    const getItemStatus = (item: any): 'exceeded' | 'within' | 'near' | 'unused' => {
        const actual = parseFloat(item.actual_amount) || 0;
        const planned = parseFloat(item.planned_total) || 0;
        if (actual === 0) return 'unused';
        if (planned > 0 && actual > planned) return 'exceeded';
        if (planned > 0 && actual >= planned * 0.8) return 'near';
        return 'within';
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'exceeded': return '#EF4444';
            case 'near': return '#F59E0B';
            case 'within': return '#10B981';
            default: return '#94A3B8';
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'exceeded': return '#FEF2F2';
            case 'near': return '#FFFBEB';
            case 'within': return '#F0FDF4';
            default: return '#F8FAFC';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'exceeded': return 'Exceeded';
            case 'near': return 'Near Limit';
            case 'within': return 'Within Budget';
            default: return 'Not Purchased';
        }
    };

    const handleClone = async () => {
        if (!budget) return;
        setCloning(true);
        try {
            let nextMonth = budget.month + 1;
            let nextYear = budget.year;
            if (nextMonth > 12) { nextMonth = 1; nextYear++; }
            await customerApi.cloneBudget(budget.id, nextMonth, nextYear);
            showToast(`Budget copied to ${MONTH_NAMES[nextMonth - 1]} ${nextYear}`);
            setShowCloneModal(false);
            navigate(`/${shopSlug}/budget`);
        } catch (err: any) {
            showToast(err.message || 'Failed to clone budget');
        } finally {
            setCloning(false);
        }
    };

    const generateInsights = (budget: any) => {
        const insights: { text: string; type: 'good' | 'warning' | 'info' }[] = [];
        const items = budget.items || [];

        const overspent = items.filter((i: any) => parseFloat(i.actual_amount) > parseFloat(i.planned_total) && parseFloat(i.planned_total) > 0);
        const savings = items.filter((i: any) => parseFloat(i.actual_amount) > 0 && parseFloat(i.actual_amount) < parseFloat(i.planned_total));
        const unused = items.filter((i: any) => parseFloat(i.actual_amount) === 0);
        const unplanned = items.filter((i: any) => parseFloat(i.planned_total) === 0 && parseFloat(i.actual_amount) > 0);

        if (overspent.length > 0) {
            const top = overspent.sort((a: any, b: any) => (parseFloat(b.actual_amount) - parseFloat(b.planned_total)) - (parseFloat(a.actual_amount) - parseFloat(a.planned_total)))[0];
            insights.push({
                text: `${top.product_name} exceeded budget by ${formatPrice(parseFloat(top.actual_amount) - parseFloat(top.planned_total))}`,
                type: 'warning',
            });
        }

        if (savings.length > 2) {
            const totalSaved = savings.reduce((acc: number, i: any) => acc + (parseFloat(i.planned_total) - parseFloat(i.actual_amount)), 0);
            insights.push({ text: `You saved ${formatPrice(totalSaved)} across ${savings.length} items`, type: 'good' });
        }

        if (unplanned.length > 0) {
            insights.push({ text: `${unplanned.length} unplanned item${unplanned.length > 1 ? 's' : ''} purchased outside budget`, type: 'info' });
        }

        if (unused.length > 0 && unused.length <= 3) {
            insights.push({ text: `${unused.map((i: any) => i.product_name).join(', ')} not purchased yet`, type: 'info' });
        } else if (unused.length > 3) {
            insights.push({ text: `${unused.length} items not purchased yet`, type: 'info' });
        }

        const totalActual = items.reduce((acc: number, i: any) => acc + (parseFloat(i.actual_amount) || 0), 0);
        const totalPlanned = parseFloat(budget.total_budget_amount) || 0;
        const now = new Date();
        if (budget.month === now.getMonth() + 1 && budget.year === now.getFullYear()) {
            const day = now.getDate();
            const daysInMonth = new Date(budget.year, budget.month, 0).getDate();
            const projected = (totalActual / Math.max(day, 1)) * daysInMonth;
            if (projected > totalPlanned * 1.1) {
                insights.push({ text: `Projected month-end spend: ${formatPrice(projected)}`, type: 'warning' });
            }
        }

        if (insights.length === 0) {
            insights.push({ text: 'Your spending is consistent with your budget plan', type: 'good' });
        }

        return insights;
    };

    if (loading) return (
        <div className="page fade-in">
            <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)' }} />
        </div>
    );
    if (!budget) return null;

    const insights = generateInsights(budget);
    const items = budget.items || [];
    const totalActual = items.reduce((acc: number, i: any) => acc + (parseFloat(i.actual_amount) || 0), 0);
    const totalPlanned = parseFloat(budget.total_budget_amount) || 0;
    const variance = totalPlanned - totalActual;
    const progress = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

    const statusCounts = {
        all: items.length,
        exceeded: items.filter((i: any) => getItemStatus(i) === 'exceeded').length,
        within: items.filter((i: any) => getItemStatus(i) === 'within' || getItemStatus(i) === 'near').length,
        unused: items.filter((i: any) => getItemStatus(i) === 'unused').length,
    };

    const filteredItems = filter === 'all'
        ? items
        : items.filter((i: any) => {
            const s = getItemStatus(i);
            if (filter === 'within') return s === 'within' || s === 'near';
            return s === filter;
        });

    let nextMonth = budget.month + 1;
    let nextYear = budget.year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => navigate(-1)} title="Go back" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <div>
                            <h1 style={{ fontSize: 20, fontWeight: 800 }}>Budget Analysis</h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                {MONTH_NAMES[budget.month - 1]} {budget.year}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link to={`/${shopSlug}/budget/create?month=${budget.month}&year=${budget.year}`}
                            style={{
                                padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--primary)',
                                background: 'white', border: '1.5px solid var(--primary)', borderRadius: 'var(--radius-md)',
                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
                            Edit
                        </Link>
                        <button onClick={() => setShowCloneModal(true)}
                            style={{
                                padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#059669',
                                background: 'white', border: '1.5px solid #059669', borderRadius: 'var(--radius-md)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                            Clone
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Card */}
            <div style={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                borderRadius: 'var(--radius-xl)', padding: 20, marginBottom: 20, color: 'white',
                boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.3)',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>Total Budget</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPrice(totalPlanned)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>Actual Spend</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPrice(totalActual)}</div>
                    </div>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, opacity: 0.9 }}>
                        <span>{Math.round(progress)}% Used</span>
                        <span>{formatPrice(Math.abs(variance))} {variance >= 0 ? 'remaining' : 'over'}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', width: `${Math.min(progress, 100)}%`,
                            background: progress >= 100 ? '#FCA5A5' : progress >= 80 ? '#FCD34D' : 'rgba(255,255,255,0.9)',
                            transition: 'width 0.8s ease-out', borderRadius: 4,
                        }} />
                    </div>
                </div>

                {/* Quick Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>{variance >= 0 ? 'Savings' : 'Over Budget'}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: variance >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                            {formatPrice(variance)}
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>Budget Type</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{budget.budget_type}</div>
                    </div>
                </div>
            </div>

            {/* Insights */}
            {insights.length > 0 && (
                <div style={{
                    background: '#F8FAFC', borderRadius: 'var(--radius-xl)', padding: 16, marginBottom: 20,
                    border: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>💡</span>
                        <h3 style={{ fontSize: 14, fontWeight: 700 }}>Smart Insights</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {insights.map((ins, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5, alignItems: 'center',
                                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                background: ins.type === 'warning' ? '#FFFBEB' : ins.type === 'good' ? '#F0FDF4' : 'white',
                            }}>
                                <span style={{ flexShrink: 0, fontSize: 14 }}>
                                    {ins.type === 'warning' ? '⚠️' : ins.type === 'good' ? '✅' : 'ℹ️'}
                                </span>
                                <span style={{ color: ins.type === 'warning' ? '#92400E' : ins.type === 'good' ? '#065F46' : 'var(--text-secondary)' }}>
                                    {ins.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {([
                    { key: 'all' as const, label: 'All' },
                    { key: 'exceeded' as const, label: 'Exceeded' },
                    { key: 'within' as const, label: 'Within' },
                    { key: 'unused' as const, label: 'Unused' },
                ]).map(({ key, label }) => (
                    <button key={key} onClick={() => setFilter(key)}
                        style={{
                            padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600,
                            whiteSpace: 'nowrap', cursor: 'pointer', border: 'none',
                            background: filter === key ? 'var(--primary)' : 'white',
                            color: filter === key ? 'white' : 'var(--text-secondary)',
                            boxShadow: filter === key ? 'none' : '0 0 0 1px var(--border)',
                        }}
                    >
                        {label} ({statusCounts[key]})
                    </button>
                ))}
            </div>

            {/* Item Breakdown */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', overflow: 'hidden',
            }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#F9FAFB' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700 }}>Item Breakdown</h3>
                </div>
                <div>
                    {filteredItems.length === 0 ? (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                            No items match this filter.
                        </div>
                    ) : (
                        filteredItems.map((item: any) => {
                            const actual = parseFloat(item.actual_amount) || 0;
                            const planned = parseFloat(item.planned_total) || 0;
                            const actualQty = parseFloat(item.actual_quantity) || 0;
                            const plannedQty = parseFloat(item.planned_quantity) || 0;
                            const status = getItemStatus(item);
                            const itemProgress = planned > 0 ? (actual / planned) * 100 : 0;
                            const remaining = planned - actual;

                            return (
                                <div key={item.budget_item_id} style={{
                                    padding: '14px 16px', borderBottom: '1px solid var(--border)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.product_name}</span>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: getStatusBg(status), color: getStatusColor(status),
                                                }}>{getStatusLabel(status)}</span>
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                                                <span>Planned: {formatPrice(planned)} ({plannedQty} qty)</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: getStatusColor(status) }}>
                                                {formatPrice(actual)}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {actualQty} qty
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress bar for this item */}
                                    {planned > 0 && (
                                        <div style={{ marginBottom: 6 }}>
                                            <div style={{ height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${Math.min(itemProgress, 100)}%`,
                                                    background: getStatusColor(status),
                                                    transition: 'width 0.6s ease-out',
                                                    borderRadius: 3,
                                                }} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Remaining / Over */}
                                    {actual > 0 && planned > 0 && (
                                        <div style={{
                                            fontSize: 11, fontWeight: 600,
                                            color: remaining >= 0 ? '#059669' : '#DC2626',
                                        }}>
                                            {remaining >= 0
                                                ? `Remaining: ${formatPrice(remaining)} (${Math.round(plannedQty - actualQty)} qty)`
                                                : `Over by ${formatPrice(Math.abs(remaining))}`
                                            }
                                        </div>
                                    )}

                                    {planned === 0 && actual > 0 && (
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
                                            Unplanned purchase
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Clone Modal */}
            {showCloneModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                }} onClick={() => setShowCloneModal(false)}>
                    <div style={{
                        background: 'white', borderRadius: '20px 20px 0 0', padding: '24px 20px',
                        width: '100%', maxWidth: 480,
                        paddingBottom: 'calc(24px + var(--safe-bottom))',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ width: 40, height: 4, background: '#D1D5DB', borderRadius: 2, margin: '0 auto 20px' }} />
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                                Clone to {MONTH_NAMES[nextMonth - 1]} {nextYear}?
                            </h3>
                            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Create a budget for {MONTH_NAMES[nextMonth - 1]} based on this month's planned items.
                                You can edit it after creation.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={() => setShowCloneModal(false)}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: 'var(--radius-lg)', fontSize: 15, fontWeight: 700,
                                    background: '#F3F4F6', color: 'var(--text)', border: 'none', cursor: 'pointer',
                                }}
                            >Cancel</button>
                            <button onClick={handleClone} disabled={cloning}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: 'var(--radius-lg)', fontSize: 15, fontWeight: 700,
                                    background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer',
                                    opacity: cloning ? 0.7 : 1,
                                }}
                            >{cloning ? 'Creating...' : 'Create Budget'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
