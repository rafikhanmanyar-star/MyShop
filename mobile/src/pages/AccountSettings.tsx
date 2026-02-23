import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';

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
    const { state, dispatch, showToast } = useApp();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [city, setCity] = useState('');
    const [postalCode, setPostalCode] = useState('');

    useEffect(() => {
        if (!state.isLoggedIn || !state.customerId) {
            navigate(`/${shopSlug}/login?redirect=account`, { replace: true });
            return;
        }
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
    }, [state.isLoggedIn, state.customerId, shopSlug, navigate, showToast]);

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
            </div>
        </div>
    );
}

