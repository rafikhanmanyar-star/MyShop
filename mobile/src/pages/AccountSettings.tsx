import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { authApi, customerApi } from '../api';

interface Profile {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postal_code: string | null;
}

export default function AccountSettings() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, showToast, refreshLoyalty } = useApp();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [city, setCity] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn || !state.customerId) {
            navigate(`/${shopSlug}/login?redirect=account`, { replace: true });
            return;
        }
        void refreshLoyalty();
        customerApi.getProfile()
            .then((profile: Profile) => {
                setName(profile.name ?? '');
                setEmail(profile.email ?? '');
                setAddressLine1(profile.address_line1 ?? '');
                setAddressLine2(profile.address_line2 ?? '');
                setCity(profile.city ?? '');
                setPostalCode(profile.postal_code ?? '');
            })
            .catch(() => showToast('Could not load profile'))
            .finally(() => setLoading(false));
    }, [state.isLoggedIn, state.customerId, shopSlug, navigate, showToast, refreshLoyalty]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!state.customerId) return;
        setSaving(true);
        try {
            const updated = await customerApi.updateProfile({
                name: name.trim() || undefined,
                email: email.trim() || undefined,
                address_line1: addressLine1.trim() || undefined,
                address_line2: addressLine2.trim() || undefined,
                city: city.trim() || undefined,
                postal_code: postalCode.trim() || undefined,
            });
            if (updated?.name !== undefined) {
                dispatch({ type: 'UPDATE_CUSTOMER_PROFILE', name: updated.name || null });
            }
            showToast('Profile updated');
        } catch (err: any) {
            showToast(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!oldPassword.trim()) {
            showToast('Please enter your current password.');
            return;
        }
        if (newPassword.length !== 4 || !/^[a-zA-Z0-9]+$/.test(newPassword)) {
            showToast('New password must be exactly 4 letters or digits');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            showToast('New passwords do not match');
            return;
        }
        setPwSaving(true);
        try {
            await authApi.changePassword(oldPassword, newPassword);
            setOldPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            showToast('Password updated');
        } catch (err: any) {
            showToast(err.message || 'Could not change password');
        } finally {
            setPwSaving(false);
        }
    };

    if (!state.isLoggedIn) return null;
    if (loading) {
        return (
            <div className="page slide-up">
                <div className="page-header"><h1>Account settings</h1></div>
                <div style={{ padding: 24, textAlign: 'center' }}>
                    <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page slide-up">
            <div className="page-header">
                <h1>Account settings</h1>
            </div>
            <div style={{ padding: '0 20px 24px', maxWidth: 420, margin: '0 auto' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                    Update your name, email and delivery address.
                </p>

                <div
                    id="loyalty"
                    style={{
                        scrollMarginTop: 80,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(255,255,255,0.95) 100%)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 16,
                        marginBottom: 20,
                    }}
                >
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span aria-hidden>🎁</span> Loyalty points
                    </h2>
                    {state.loyalty.fetchFailed && state.loyalty.totalPoints == null ? (
                        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Points unavailable right now.</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                                {(state.loyalty.totalPoints ?? 0).toLocaleString()}{' '}
                                <span style={{ fontSize: 15, fontWeight: 600 }}>points</span>
                            </p>
                            {state.loyalty.fetchFailed && (
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Showing last saved balance.
                                </p>
                            )}
                            {state.loyalty.pointsValue != null && state.loyalty.pointsValue > 0 && (
                                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                    ≈ Rs.{' '}
                                    {state.loyalty.pointsValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                                    redeemable value (shop policy)
                                </p>
                            )}
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                                {state.loyalty.redemptionRatio != null ? (
                                    <>
                                        100 points ≈ Rs.{' '}
                                        {(100 * state.loyalty.redemptionRatio).toLocaleString(undefined, {
                                            maximumFractionDigits: 2,
                                        })}{' '}
                                        (redemption ratio set by the shop)
                                    </>
                                ) : (
                                    'Redemption value follows your shop’s loyalty policy.'
                                )}
                            </p>
                        </>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Phone</label>
                        <input
                            className="input"
                            type="tel"
                            value={state.customerPhone ?? ''}
                            disabled
                            style={{ opacity: 0.8, cursor: 'not-allowed' }}
                        />
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Phone cannot be changed.</p>
                    </div>

                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Name</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Email (optional)</label>
                        <input
                            className="input"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Address line 1</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="Street address"
                            value={addressLine1}
                            onChange={e => setAddressLine1(e.target.value)}
                        />
                    </div>

                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Address line 2 (optional)</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="Apartment, suite, etc."
                            value={addressLine2}
                            onChange={e => setAddressLine2(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <div className="input-group" style={{ flex: 1, textAlign: 'left' }}>
                            <label>City</label>
                            <input
                                className="input"
                                type="text"
                                placeholder="City"
                                value={city}
                                onChange={e => setCity(e.target.value)}
                            />
                        </div>
                        <div className="input-group" style={{ flex: 1, textAlign: 'left' }}>
                            <label>Postal code</label>
                            <input
                                className="input"
                                type="text"
                                placeholder="Postal code"
                                value={postalCode}
                                onChange={e => setPostalCode(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={saving}
                        style={{ marginTop: 24, padding: 16, fontSize: 16 }}
                    >
                        {saving ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Save changes'}
                    </button>
                </form>

                <form onSubmit={handleChangePassword} style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border-light)' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Change password</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                        Use exactly 4 letters or digits (same as login).
                    </p>
                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Current password</label>
                        <input
                            className="input"
                            type="password"
                            autoComplete="current-password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                        />
                    </div>
                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>New password</label>
                        <input
                            className="input"
                            type="password"
                            autoComplete="new-password"
                            maxLength={4}
                            placeholder="4 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>
                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Confirm new password</label>
                        <input
                            className="input"
                            type="password"
                            autoComplete="new-password"
                            maxLength={4}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={pwSaving}
                        style={{ marginTop: 16, padding: 16, fontSize: 16 }}
                    >
                        {pwSaving ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Update password'}
                    </button>
                </form>
            </div>
        </div>
    );
}

