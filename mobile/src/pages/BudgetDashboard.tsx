import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { customerApi } from '../api';
import { useApp } from '../context/AppContext';

export default function BudgetDashboard() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state } = useApp();
    const [summary, setSummary] = useState<any>(null);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`);
            return;
        }

        const loadData = async () => {
            try {
                const [summaryData, listData] = await Promise.all([
                    customerApi.getBudgetSummary(),
                    customerApi.getBudgets()
                ]);
                setSummary(summaryData.budgetId ? summaryData : null);
                setBudgets(listData);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [state.isLoggedIn, shopSlug]);

    const formatPrice = (n: number) => `Rs. ${n.toLocaleString()}`;

    const getMonthName = (m: number) => {
        return new Date(2000, m - 1).toLocaleString('default', { month: 'long' });
    };

    if (loading) return (
        <div className="page fade-in">
            <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 60, width: '60%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
        </div>
    );

    return (
        <div className="page fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800 }}>Budget</h1>
                <Link to={`/${shopSlug}/budget/create`} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 14 }}>
                    {summary ? 'Edit Budget' : 'Set Budget'}
                </Link>
            </div>

            {summary ? (
                <div style={{
                    background: 'white',
                    borderRadius: 'var(--radius-xl)',
                    padding: 24,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                    marginBottom: 24,
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {getMonthName(new Date().getMonth() + 1)} {new Date().getFullYear()}
                            </span>
                            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                                {formatPrice(summary.totalBudget)}
                            </div>
                        </div>
                        <div style={{
                            background: summary.totalOverspent > 0 ? '#FEF2F2' : '#F0FDF4',
                            color: summary.totalOverspent > 0 ? '#EF4444' : '#10B981',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 12,
                            fontWeight: 700
                        }}>
                            {summary.totalOverspent > 0 ? `Overspend: ${formatPrice(summary.totalOverspent)}` : `Saved: ${formatPrice(summary.totalSaved)}`}
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                            <span style={{ color: 'var(--text-muted)' }}>Spent: {formatPrice(summary.totalActual)}</span>
                            <span style={{ fontWeight: 600 }}>{Math.round(summary.progress)}%</span>
                        </div>
                        <div style={{ height: 10, background: '#F3F4F6', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${Math.min(summary.progress, 100)}%`,
                                background: summary.progress > 100 ? 'var(--danger)' : 'var(--primary)',
                                transition: 'width 1s ease-out',
                                borderRadius: 5
                            }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, background: '#F9FAFB', padding: 12, borderRadius: 'var(--radius-lg)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Remaining</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: summary.remainingBudget < 0 ? 'var(--danger)' : 'inherit' }}>
                                {formatPrice(summary.remainingBudget)}
                            </div>
                        </div>
                        <Link to={`/${shopSlug}/budget/${summary.budgetId}`} style={{ flex: 1, background: 'var(--primary)', color: 'white', padding: 12, borderRadius: 'var(--radius-lg)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>
                            View Analysis
                        </Link>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F9FAFB', borderRadius: 'var(--radius-xl)', marginBottom: 24 }}>
                    <div style={{ fontSize: 50, marginBottom: 16 }}>📝</div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No budget set for this month</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                        Set a monthly grocery budget to track your spending and save more.
                    </p>
                    <Link to={`/${shopSlug}/budget/create`} className="btn btn-primary">
                        Create March Budget
                    </Link>
                </div>
            )}

            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Previous Budgets</h2>
            {budgets.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {budgets.map((b: any) => (
                        <Link key={b.id} to={`/${shopSlug}/budget/${b.id}`} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'white',
                            padding: 16,
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border)',
                            textDecoration: 'none',
                            color: 'inherit'
                        }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>{getMonthName(b.month)} {b.year}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{formatPrice(b.total_budget_amount)} • {b.budget_type}</div>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 20 }}>
                    No budget history found.
                </p>
            )}
        </div>
    );
}
