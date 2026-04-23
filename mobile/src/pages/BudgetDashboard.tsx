import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { customerApi } from '../api';
import { useApp } from '../context/AppContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function BudgetDashboard() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state } = useApp();
    const [summary, setSummary] = useState<any>(null);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [hasSuggestions, setHasSuggestions] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`);
            return;
        }
        loadData();
    }, [state.isLoggedIn, shopSlug, selectedMonth, selectedYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [summaryData, listData, alertsData, suggestionsData] = await Promise.all([
                customerApi.getBudgetSummary(selectedMonth, selectedYear),
                customerApi.getBudgets(),
                customerApi.getBudgetAlerts().catch(() => ({ alerts: [] })),
                customerApi.getBudgetSuggestions(selectedMonth, selectedYear).catch(() => ({ hasData: false })),
            ]);
            setSummary(summaryData?.budgetId ? summaryData : null);
            setBudgets(listData);
            setAlerts(alertsData.alerts || []);
            setHasSuggestions(suggestionsData.hasData || false);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

    const navigateMonth = (dir: number) => {
        let m = selectedMonth + dir;
        let y = selectedYear;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        setSelectedMonth(m);
        setSelectedYear(y);
    };

    const isCurrentMonth = selectedMonth === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear();

    if (loading) return (
        <div className="page fade-in">
            <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
        </div>
    );

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800 }}>Budget Planner</h1>
                <Link
                    to={`/${shopSlug}/budget/create`}
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: 13, borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    {summary ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    )}
                    {summary ? 'Edit' : 'New'}
                </Link>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {alerts.map((alert, i) => (
                        <div key={i} style={{
                            padding: '12px 16px',
                            borderRadius: 'var(--radius-lg)',
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: alert.severity === 'danger' ? '#FEF2F2' : alert.severity === 'warning' ? '#FFFBEB' : '#EFF6FF',
                            color: alert.severity === 'danger' ? '#DC2626' : alert.severity === 'warning' ? '#D97706' : '#2563EB',
                            border: `1px solid ${alert.severity === 'danger' ? '#FECACA' : alert.severity === 'warning' ? '#FDE68A' : '#BFDBFE'}`,
                        }}>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>
                                {alert.severity === 'danger' ? '🔴' : alert.severity === 'warning' ? '🟡' : '💡'}
                            </span>
                            <span style={{ flex: 1 }}>{alert.message}</span>
                            {alert.type === 'new_month' && (
                                <Link to={`/${shopSlug}/budget/create?mode=quick`} style={{ color: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    Create →
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Month Selector */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'white', borderRadius: 'var(--radius-lg)', padding: '10px 16px',
                border: '1px solid var(--border)', marginBottom: 20,
            }}>
                <button onClick={() => navigateMonth(-1)} title="Previous month" style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <button onClick={() => setShowMonthPicker(!showMonthPicker)} style={{
                    background: 'none', border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)'
                }}>
                    {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button onClick={() => navigateMonth(1)} title="Next month" style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
            </div>

            {/* Quick Month Picker Grid */}
            {showMonthPicker && (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-xl)', padding: 16,
                    border: '1px solid var(--border)', marginBottom: 20, marginTop: -12,
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {MONTH_NAMES.map((name, i) => (
                            <button key={i} onClick={() => { setSelectedMonth(i + 1); setShowMonthPicker(false); }}
                                style={{
                                    padding: '10px 4px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
                                    border: selectedMonth === i + 1 ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: selectedMonth === i + 1 ? '#EEF2FF' : 'white',
                                    color: selectedMonth === i + 1 ? 'var(--primary)' : 'var(--text)',
                                    cursor: 'pointer',
                                }}
                            >{name.slice(0, 3)}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Budget Summary Card */}
            {summary ? (
                <div style={{
                    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                    borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 24, color: 'white',
                    boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.3)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                                Total Budget
                            </div>
                            <div style={{ fontSize: 30, fontWeight: 800 }}>{formatPrice(summary.totalBudget)}</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                            padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700,
                        }}>
                            {summary.totalOverspent > 0 ? `Over: ${formatPrice(summary.totalOverspent)}` : `Saved: ${formatPrice(summary.totalSaved)}`}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, opacity: 0.9 }}>
                            <span>Spent: {formatPrice(summary.totalActual)}</span>
                            <span style={{ fontWeight: 700 }}>{Math.round(summary.progress)}%</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', width: `${Math.min(summary.progress, 100)}%`,
                                background: summary.progress >= 100 ? '#FCA5A5' : summary.progress >= 80 ? '#FCD34D' : 'rgba(255,255,255,0.9)',
                                transition: 'width 1s ease-out', borderRadius: 4,
                            }} />
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 8px', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>Remaining</div>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{formatPrice(Math.max(0, summary.remainingBudget))}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 8px', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>Items</div>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{summary.totalItems}</div>
                        </div>
                        <Link to={`/${shopSlug}/budget/${summary.budgetId}`} style={{
                            background: 'rgba(255,255,255,0.25)', padding: '10px 8px', borderRadius: 'var(--radius-lg)',
                            textAlign: 'center', color: 'white', textDecoration: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>Details →</span>
                        </Link>
                    </div>

                    {/* Item Status Dots */}
                    {(summary.exceededItems > 0 || summary.withinItems > 0) && (
                        <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11, opacity: 0.9 }}>
                            {summary.withinItems > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34D399' }} />
                                    {summary.withinItems} within
                                </span>
                            )}
                            {summary.exceededItems > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FCA5A5' }} />
                                    {summary.exceededItems} exceeded
                                </span>
                            )}
                            {summary.untouchedItems > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                                    {summary.untouchedItems} unused
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* No Budget — Smart CTA */
                <div style={{
                    textAlign: 'center', padding: '36px 24px',
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)',
                    borderRadius: 'var(--radius-xl)', marginBottom: 24,
                    border: '1px solid var(--border)',
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                        No budget for {MONTH_NAMES[selectedMonth - 1]}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                        {hasSuggestions
                            ? 'We can auto-generate a smart budget based on your recent purchases.'
                            : 'Set a monthly grocery budget to track your spending and save more.'}
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {hasSuggestions && (
                            <Link to={`/${shopSlug}/budget/create?mode=quick&month=${selectedMonth}&year=${selectedYear}`}
                                className="btn btn-primary" style={{ padding: '12px 24px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                                Auto Generate
                            </Link>
                        )}
                        <Link to={`/${shopSlug}/budget/create?mode=manual&month=${selectedMonth}&year=${selectedYear}`}
                            className="btn btn-outline" style={{ padding: '12px 24px', fontSize: 14 }}
                        >
                            Create Manually
                        </Link>
                    </div>
                </div>
            )}

            {/* Auto Suggest Prompt (when budget exists but for next month) */}
            {summary && isCurrentMonth && hasSuggestions && (
                <div style={{
                    background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', borderRadius: 'var(--radius-xl)',
                    padding: 20, marginBottom: 24, border: '1px solid #A7F3D0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 20 }}>🤖</span>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>Smart Budget Ready</h3>
                    </div>
                    <p style={{ fontSize: 13, color: '#047857', marginBottom: 14, lineHeight: 1.5 }}>
                        Create next month's budget based on your current spending pattern.
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <Link to={`/${shopSlug}/budget/create?mode=quick&month=${selectedMonth === 12 ? 1 : selectedMonth + 1}&year=${selectedMonth === 12 ? selectedYear + 1 : selectedYear}`}
                            style={{
                                flex: 1, padding: '10px 16px', background: '#059669', color: 'white',
                                borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 700,
                                textAlign: 'center', textDecoration: 'none',
                            }}
                        >Review & Create</Link>
                        <Link to={`/${shopSlug}/budget/create?mode=manual&month=${selectedMonth === 12 ? 1 : selectedMonth + 1}&year=${selectedMonth === 12 ? selectedYear + 1 : selectedYear}`}
                            style={{
                                flex: 1, padding: '10px 16px', background: 'white', color: '#059669',
                                borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 700,
                                textAlign: 'center', textDecoration: 'none', border: '1px solid #A7F3D0',
                            }}
                        >Start Fresh</Link>
                    </div>
                </div>
            )}

            {/* Budget History */}
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Previous Budgets
            </h2>
            {budgets.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {budgets.map((b: any) => {
                        const totalActual = parseFloat(b.total_budget_amount) || 0;
                        return (
                            <Link key={b.id} to={`/${shopSlug}/budget/${b.id}`} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: 'white', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit',
                                transition: 'box-shadow 0.2s',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                        background: b.status === 'active' ? '#EEF2FF' : '#F9FAFB',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 16,
                                    }}>
                                        {b.status === 'active' ? '📋' : '✅'}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                                            {MONTH_NAMES[b.month - 1]} {b.year}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                                            <span>{formatPrice(totalActual)}</span>
                                            <span style={{
                                                padding: '1px 6px', borderRadius: 'var(--radius-full)', fontSize: 10,
                                                fontWeight: 600, background: b.status === 'active' ? '#DBEAFE' : '#F3F4F6',
                                                color: b.status === 'active' ? '#2563EB' : '#6B7280',
                                            }}>{b.status === 'active' ? 'Active' : 'Closed'}</span>
                                        </div>
                                    </div>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 30 }}>
                    No budget history yet. Create your first budget to get started.
                </p>
            )}
        </div>
    );
}
