import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';

type LoyaltyDetails = {
    total_points: number;
    redemption_ratio: number;
    tier: string | null;
};

export default function LoyaltyBenefits() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, refreshLoyalty } = useApp();
    const [details, setDetails] = useState<LoyaltyDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=loyalty/benefits`, { replace: true });
            return;
        }
        void refreshLoyalty({ force: true });
        customerApi
            .getLoyaltyPoints()
            .then((data: LoyaltyDetails & { total_points: number; redemption_ratio?: number; tier?: string | null }) => {
                setDetails({
                    total_points: Math.max(0, Math.floor(Number(data.total_points) || 0)),
                    redemption_ratio:
                        typeof data.redemption_ratio === 'number' && Number.isFinite(data.redemption_ratio)
                            ? data.redemption_ratio
                            : 0.01,
                    tier: data.tier ?? null,
                });
            })
            .catch(() => {
                const ratio = state.loyalty.redemptionRatio ?? 0.01;
                setDetails({
                    total_points: state.loyalty.totalPoints ?? 0,
                    redemption_ratio: ratio,
                    tier: null,
                });
            })
            .finally(() => setLoading(false));
    }, [state.isLoggedIn, shopSlug, navigate, refreshLoyalty]);

    const ratio = details?.redemption_ratio ?? state.loyalty.redemptionRatio ?? 0.01;
    const per100Rs = Math.round(100 * ratio * 100) / 100;
    const balance = details?.total_points ?? state.loyalty.totalPoints ?? 0;
    const tier = details?.tier;

    if (!state.isLoggedIn) return null;

    return (
        <div className="page slide-up">
            <div className="page-header">
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginBottom: 8 }}
                    onClick={() => navigate(-1)}
                >
                    ← Back
                </button>
                <h1>Your benefits</h1>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                    How you earn and use points at {state.shop?.company_name || state.shop?.name || 'this shop'}
                </p>
            </div>

            <div className="loyalty-benefits" style={{ padding: '0 20px 24px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                    </div>
                ) : (
                    <>
                        <div className="loyalty-benefits__balance card">
                            <p className="loyalty-benefits__label">Your balance</p>
                            <p className="loyalty-benefits__points">
                                {balance.toLocaleString()} <span>points</span>
                            </p>
                            {tier && (
                                <p className="loyalty-benefits__tier">
                                    Member tier: <strong>{tier}</strong>
                                </p>
                            )}
                        </div>

                        <section className="loyalty-benefits__section card">
                            <h2>Earn points</h2>
                            <ul>
                                <li>Earn <strong>1 point</strong> for every <strong>Rs. 100</strong> spent on delivered orders.</li>
                                <li>Points are added when your order is marked delivered.</li>
                                <li>In-store purchases at the shop also count toward your balance.</li>
                            </ul>
                        </section>

                        <section className="loyalty-benefits__section card">
                            <h2>Redeem points</h2>
                            <ul>
                                <li>
                                    <strong>100 points</strong> ≈ <strong>Rs. {per100Rs.toLocaleString()}</strong> at checkout
                                    (shop redemption rate).
                                </li>
                                <li>Redeem on your next order or at the store counter when paying.</li>
                                <li>Keep shopping to unlock more perks and offers.</li>
                            </ul>
                        </section>

                        <section className="loyalty-benefits__section card">
                            <h2>More ways to save</h2>
                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                Browse active promotions and bundle deals.
                            </p>
                            <Link to={`/${shopSlug}/offers`} className="btn btn-primary btn-full">
                                View offers
                            </Link>
                        </section>

                        <Link
                            to={`/${shopSlug}/loyalty/history`}
                            className="btn btn-outline btn-full"
                            style={{ marginTop: 12 }}
                        >
                            View points history
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
