import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useApp } from '../context/AppContext';
import { useOnline } from '../hooks/useOnline';
import { parsePakistanMobile } from '../utils/pakistanMobile';

export default function ForgotPassword() {
    const { shopSlug } = useParams();
    const { showToast } = useApp();
    const online = useOnline();
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async () => {
        if (!online) {
            showToast('Connect to send a reset request.');
            return;
        }
        const parsed = parsePakistanMobile(phone);
        if (!parsed.ok) {
            showToast(parsed.message);
            return;
        }
        setLoading(true);
        try {
            await authApi.forgotPassword(parsed.digits, shopSlug!);
            setDone(true);
            showToast('Request sent. Ask the shop to complete reset on the POS.');
        } catch (err: any) {
            showToast(err.message || 'Could not send request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page slide-up">
            <div style={{ textAlign: 'center', paddingTop: 32, maxWidth: 400, margin: '0 auto', paddingLeft: 20, paddingRight: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Forgot password</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                    Enter your phone number. Your shop will receive a reset request and send you a new password (often via WhatsApp).
                </p>
                {done ? (
                    <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                        If an account exists for this number, the shop has been notified.
                    </p>
                ) : (
                    <>
                        <div className="input-group" style={{ textAlign: 'left' }}>
                            <label>Phone Number</label>
                            <input
                                className="input"
                                type="tel"
                                inputMode="numeric"
                                placeholder="923*********"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                onBlur={() => {
                                    const p = parsePakistanMobile(phone);
                                    if (p.ok) setPhone(p.digits);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary btn-full"
                            onClick={submit}
                            disabled={loading || !online || !phone}
                            style={{ marginTop: 16, padding: 14 }}
                        >
                            {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Send request'}
                        </button>
                    </>
                )}
                {shopSlug && (
                    <Link to={`/${shopSlug}/login`} style={{ display: 'inline-block', marginTop: 24, fontSize: 14, color: 'var(--primary)', fontWeight: 600 }}>
                        ← Back to login
                    </Link>
                )}
            </div>
        </div>
    );
}
