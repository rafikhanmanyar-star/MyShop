import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { authApi } from '../api';

type Mode = 'login' | 'register';

export default function Login() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { dispatch, showToast } = useApp();

    const [mode, setMode] = useState<Mode>('login');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [loading, setLoading] = useState(false);

    const redirect = searchParams.get('redirect') || '';

    const handleSubmit = async () => {
        if (!phone || phone.length < 10) {
            showToast('Please enter a valid phone number');
            return;
        }
        if (!password || password.length < 4) {
            showToast('Password must be at least 4 characters');
            return;
        }

        setLoading(true);
        try {
            let result;
            if (mode === 'register') {
                if (!name || !addressLine1) {
                    showToast('Name and Address are required for registration');
                    setLoading(false);
                    return;
                }
                result = await authApi.register(phone, password, name, addressLine1, shopSlug!);
                showToast('Registration successful!');
            } else {
                result = await authApi.login(phone, password, shopSlug!);
                showToast('Login successful!');
            }

            dispatch({
                type: 'LOGIN',
                customerId: result.customerId,
                phone: result.phone,
                token: result.token,
            });
            navigate(`/${shopSlug}/${redirect || ''}`, { replace: true });
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page slide-up">
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
                {/* Header */}
                <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px', color: 'white', fontSize: 32,
                }}>
                    📱
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    {mode === 'login' ? 'Welcome Back' : 'Create an Account'}
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 14 }}>
                    {mode === 'login' ? 'Login with your phone and password' : 'Register with your details to continue'}
                </p>

                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label>Phone Number</label>
                    <input
                        className="input"
                        type="tel"
                        placeholder="e.g. +123456789"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        autoFocus
                    />
                </div>

                {mode === 'register' && (
                    <>
                        <div className="input-group" style={{ textAlign: 'left' }}>
                            <label>Name</label>
                            <input
                                className="input"
                                type="text"
                                placeholder="Your Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                        <div className="input-group" style={{ textAlign: 'left' }}>
                            <label>Address</label>
                            <input
                                className="input"
                                type="text"
                                placeholder="Delivery Address"
                                value={addressLine1}
                                onChange={e => setAddressLine1(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label>Password</label>
                    <input
                        className="input"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                </div>

                <button
                    className="btn btn-primary btn-full"
                    onClick={handleSubmit}
                    disabled={loading || !phone || !password || (mode === 'register' && (!name || !addressLine1))}
                    style={{ marginTop: 8, padding: 16, fontSize: 16 }}
                >
                    {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : (mode === 'login' ? 'Login' : 'Register')}
                </button>

                <button
                    style={{
                        marginTop: 16, color: 'var(--primary)',
                        fontSize: 14, background: 'none', border: 'none',
                        fontWeight: 'bold', cursor: 'pointer'
                    }}
                    onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                    {mode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
                </button>
            </div>
        </div>
    );
}
