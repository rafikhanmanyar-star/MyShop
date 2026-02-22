import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customerApi } from '../api';

export default function BudgetDetail() {
    const { id, shopSlug } = useParams();
    const navigate = useNavigate();
    const [budget, setBudget] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
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
        load();
    }, [id, shopSlug]);

    const formatPrice = (n: any) => {
        const val = parseFloat(n);
        if (isNaN(val)) return 'Rs. 0';
        return `Rs. ${Math.abs(val).toLocaleString()}`;
    };

    const handleClone = async () => {
        if (!budget) return;
        const confirmClone = window.confirm(`Copy this budget to the next month?`);
        if (!confirmClone) return;

        try {
            setLoading(true);
            // Calculate next month
            let nextMonth = budget.month + 1;
            let nextYear = budget.year;
            if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
            }

            await customerApi.cloneBudget(budget.id, nextMonth, nextYear);
            alert(`Budget successfully copied to ${new Date(nextYear, nextMonth - 1).toLocaleString('default', { month: 'long' })}!`);
            navigate(`/${shopSlug}/budget`);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const generateInsights = (budget: any) => {
        const insights = [];
        const overspentItems = budget.items.filter((i: any) => parseFloat(i.actual_amount) > parseFloat(i.planned_total));
        const savingsItems = budget.items.filter((i: any) => parseFloat(i.actual_amount) < parseFloat(i.planned_total) && parseFloat(i.actual_amount) > 0);

        if (overspentItems.length > 0) {
            const topOver = overspentItems.sort((a: any, b: any) => parseFloat(b.variance_amount) - parseFloat(a.variance_amount))[0];
            insights.push(`You overspent on ${topOver.product_name} by ${Math.abs(Math.round(topOver.variance_percentage))}% this month.`);
        }

        const totalActual = budget.items.reduce((acc: number, i: any) => acc + parseFloat(i.actual_amount), 0);
        const totalPlanned = parseFloat(budget.total_budget_amount);

        if (totalActual > totalPlanned) {
            const daysInMonth = new Date(budget.year, budget.month, 0).getDate();
            const currentDay = new Date().getDate();
            const burnRate = totalActual / currentDay;
            const projected = burnRate * daysInMonth;
            if (projected > totalPlanned) {
                insights.push(`Projected month-end spend: ${formatPrice(projected)}. You might exceed budget by ${formatPrice(projected - totalPlanned)}.`);
            }
        }

        if (savingsItems.length > 2) {
            insights.push(`Great job! You're saving on ${savingsItems.length} categories.`);
        }

        // Add dummy insight if none generated
        if (insights.length === 0) {
            insights.push("Your spending is consistent with your budget plan.");
        }

        return insights;
    };

    if (loading) return <div className="page fade-in"><div className="skeleton" style={{ height: 300 }} /></div>;
    if (!budget) return null;

    const insights = generateInsights(budget);
    const totalActual = budget.items.reduce((acc: number, i: any) => acc + (parseFloat(i.actual_amount) || 0), 0);
    const totalPlanned = parseFloat(budget.total_budget_amount) || 0;
    const variance = totalPlanned - totalActual;

    return (
        <div className="page fade-in">
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Analysis</h1>
                    </div>
                    <button
                        onClick={handleClone}
                        style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'white',
                            border: '1.5px solid var(--primary)', borderRadius: 'var(--radius-md)', padding: '6px 12px',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>
                        Copy to Next Month
                    </button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginLeft: 36 }}>
                    {new Date(budget.year, budget.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </p>
            </div>

            {/* Smart Insights */}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 'var(--radius-xl)', padding: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>✨</span>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0369A1' }}>Smart Insights</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {insights.map((ins, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#075985', lineHeight: 1.5 }}>
                            <div style={{ marginTop: 6, width: 4, height: 4, borderRadius: '50%', background: '#0369A1', flexShrink: 0 }} />
                            {ins}
                        </div>
                    ))}
                </div>
            </div>

            {/* Overall Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                <div style={{ background: 'white', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Actual Spend</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{formatPrice(totalActual)}</div>
                </div>
                <div style={{ background: 'white', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{variance >= 0 ? 'Savings' : 'Over Budget'}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: variance >= 0 ? '#10B981' : '#EF4444' }}>{formatPrice(variance)}</div>
                </div>
            </div>

            {/* Product List */}
            <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#F9FAFB' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>Item Breakdown</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {budget.items.map((item: any) => {
                        const actual = parseFloat(item.actual_amount) || 0;
                        const planned = parseFloat(item.planned_total) || 0;
                        const status = actual > planned ? 'over' : actual > 0 ? 'under' : 'pending';

                        return (
                            <div key={item.budget_item_id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.product_name}</div>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            Planned: {formatPrice(planned)} ({item.planned_quantity} {item.unit || 'pcs'})
                                        </div>
                                    </div>
                                    {actual > 0 && (
                                        <div style={{ height: 4, background: '#F3F4F6', borderRadius: 2, marginTop: 10, width: '80%', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.min((actual / planned) * 100, 100)}%`,
                                                background: actual > planned ? '#EF4444' : '#10B981'
                                            }} />
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: status === 'over' ? '#EF4444' : 'inherit' }}>
                                        {formatPrice(actual)}
                                    </div>
                                    {actual > 0 && (
                                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: status === 'over' ? '#EF4444' : '#10B981' }}>
                                            {status === 'over' ? `+${formatPrice(actual - planned)}` : `Saved ${formatPrice(planned - actual)}`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
