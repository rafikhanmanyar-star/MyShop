import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { authApi, getFullImageUrl, publicApi } from '../api';
import { useOnline } from '../hooks/useOnline';
import { parsePakistanMobile, PHONE_HELPER_TEXT } from '../utils/pakistanMobile';

type Mode = 'login' | 'register';
type RegisterStep = 'details' | 'otp';

export default function Login() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { state, dispatch, showToast } = useApp();
    const online = useOnline();

    const [mode, setMode] = useState<Mode>('login');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [loading, setLoading] = useState(false);
    const [registerStep, setRegisterStep] = useState<RegisterStep>('details');
    const [otpRequiredHint, setOtpRequiredHint] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    const redirect = searchParams.get('redirect') || '';

    useEffect(() => {
        setRegisterStep('details');
        setOtpCode('');
    }, [mode, shopSlug]);

    useEffect(() => {
        if (!shopSlug || mode !== 'register') {
            setOtpRequiredHint(false);
            return;
        }
        publicApi.getSignupOtpConfig(shopSlug).then((c: { signup_otp_required?: boolean }) => setOtpRequiredHint(!!c.signup_otp_required)).catch(() => setOtpRequiredHint(false));
    }, [shopSlug, mode]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = window.setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
        return () => window.clearInterval(t);
    }, [resendCooldown]);

    const handleSubmit = async () => {
        if (!online) {
            showToast('Connect to sign in or register.');
            return;
        }
        const parsedPhone = parsePakistanMobile(phone);
        if (!parsedPhone.ok) {
            showToast(parsedPhone.message);
            return;
        }
        const phoneDigits = parsedPhone.digits;
        if (!password || password.length !== 4 || !/^[a-zA-Z0-9]+$/.test(password)) {
            showToast('Password must be exactly 4 letters or digits');
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

                let signupOtpRequired = otpRequiredHint;
                try {
                    const cfg = await publicApi.getSignupOtpConfig(shopSlug!);
                    signupOtpRequired = !!cfg.signup_otp_required;
                    setOtpRequiredHint(signupOtpRequired);
                } catch {
                    /* keep cached hint */
                }

                if (signupOtpRequired && registerStep === 'details') {
                    await authApi.registerRequestOtp(phoneDigits, password, name, addressLine1, shopSlug!);
                    setRegisterStep('otp');
                    setResendCooldown(55);
                    showToast('Verification code sent by SMS.');
                    return;
                }

                if (signupOtpRequired && registerStep === 'otp') {
                    const code = otpCode.trim();
                    if (!/^\d{6}$/.test(code)) {
                        showToast('Enter the 6-digit code from SMS.');
                        setLoading(false);
                        return;
                    }
                    result = await authApi.registerVerifyOtp(phoneDigits, shopSlug!, code);
                    showToast('Registration successful!');
                } else {
                    result = await authApi.register(phoneDigits, password, name, addressLine1, shopSlug!);
                    showToast('Registration successful!');
                }
            } else {
                result = await authApi.login(phoneDigits, password, shopSlug!);
                showToast('Login successful!');
            }

            dispatch({
                type: 'LOGIN',
                customerId: result.customerId,
                phone: result.phone,
                name: result.name || null,
                token: result.token,
                loyaltyTotalPoints: result.loyalty_points,
                loyaltyPointsValue: result.loyalty_points_value,
                loyaltyRedemptionRatio: result.loyalty_redemption_ratio,
                loyaltyLastUpdated: result.loyalty_last_updated ?? null,
            });
            navigate(`/${shopSlug}/${redirect || ''}`, { replace: true });
        } catch (err: any) {
            showToast(err.message);
            const msg = String(err?.message || '');
            if (msg.includes('SIGNUP_OTP_REQUIRED') || msg.includes('SMS verification')) {
                setOtpRequiredHint(true);
                setRegisterStep('details');
            }
            if (err.message?.includes('already registered')) {
                setMode('login');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page slide-up">
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
                {/* Header */}
                {state.branding?.logo_url ? (
                    <img
                        src={getFullImageUrl(state.branding.logo_url)}
                        alt="Shop Logo"
                        style={{
                            width: 100, height: 100, borderRadius: '20%',
                            objectFit: 'cover', margin: '0 auto 20px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                    />
                ) : (
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px', color: 'white', fontSize: 32,
                    }}>
                        📱
                    </div>
                )}

                <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    {state.shop ? state.shop.company_name || state.shop.name : 'Welcome'}
                </h1>

                {!online && (
                    <div style={{
                        background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(217, 119, 6, 0.5)',
                        borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#92400E',
                    }}>
                        You're offline. Connect to sign in or register.
                        {state.isLoggedIn && (
                            <p style={{ marginTop: 8, marginBottom: 0 }}>
                                You're signed in offline. You can continue to browse and add to cart.
                            </p>
                        )}
                    </div>
                )}

                {state.isLoggedIn && online && (
                    <p style={{ color: 'var(--accent)', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
                        You're already signed in.
                    </p>
                )}

                <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 14 }}>
                    {!online
                        ? 'Sign in when you have a connection.'
                        : mode === 'login'
                            ? 'Login with your phone and password'
                            : registerStep === 'otp'
                                ? 'Enter the 6-digit code we sent by SMS to verify your number.'
                                : otpRequiredHint
                                    ? 'Register your details. We will send a verification code by SMS.'
                                    : 'Register with your details to continue'}
                </p>

                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label>Phone Number</label>
                    <input
                        className="input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="0300 1234567"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={() => {
                            const parsed = parsePakistanMobile(phone);
                            if (parsed.ok) setPhone(parsed.digits);
                        }}
                        readOnly={mode === 'register' && registerStep === 'otp'}
                        autoFocus={!(mode === 'register' && registerStep === 'otp')}
                    />
                    <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {PHONE_HELPER_TEXT}
                    </p>
                </div>

                {mode === 'register' && registerStep === 'details' && (
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

                {mode === 'register' && registerStep === 'otp' && (
                    <div className="input-group" style={{ textAlign: 'left' }}>
                        <label>Verification code</label>
                        <input
                            className="input"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            autoFocus
                        />
                        <button
                            type="button"
                            style={{
                                marginTop: 12,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                fontSize: 14,
                                fontWeight: 700,
                                color: 'var(--primary)',
                                cursor: resendCooldown > 0 || loading ? 'default' : 'pointer',
                                opacity: resendCooldown > 0 || loading ? 0.5 : 1,
                            }}
                            disabled={resendCooldown > 0 || loading || !online}
                            onClick={async () => {
                                const parsedPhone = parsePakistanMobile(phone);
                                if (!parsedPhone.ok) {
                                    showToast(parsedPhone.message);
                                    return;
                                }
                                if (!password || password.length !== 4 || !/^[a-zA-Z0-9]+$/.test(password)) {
                                    showToast('Password must be exactly 4 letters or digits');
                                    return;
                                }
                                if (!name || !addressLine1) {
                                    showToast('Name and Address are required');
                                    return;
                                }
                                setLoading(true);
                                try {
                                    await authApi.registerRequestOtp(parsedPhone.digits, password, name, addressLine1, shopSlug!);
                                    setResendCooldown(55);
                                    showToast('New code sent.');
                                } catch (e: any) {
                                    showToast(e.message);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                        </button>
                        <button
                            type="button"
                            style={{
                                display: 'block',
                                marginTop: 8,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                fontSize: 14,
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                            onClick={() => { setRegisterStep('details'); setOtpCode(''); }}
                        >
                            Edit details
                        </button>
                    </div>
                )}

                {(mode !== 'register' || registerStep === 'details') && (
                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label>Password</label>
                    <input
                        className="input"
                        type="password"
                        inputMode="text"
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        placeholder="4 characters"
                        maxLength={4}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                        Exactly 4 characters (letters or digits).
                    </p>
                </div>
                )}

                {mode === 'login' && shopSlug && (
                    <div style={{ textAlign: 'left', marginTop: 12 }}>
                        <Link
                            to={`/${shopSlug}/forgot-password`}
                            style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600 }}
                        >
                            Forgot password?
                        </Link>
                    </div>
                )}

                <button
                    className="btn btn-primary btn-full"
                    onClick={handleSubmit}
                    disabled={
                        loading ||
                        !online ||
                        !phone ||
                        !password ||
                        (mode === 'register' &&
                            (registerStep === 'details'
                                ? !name || !addressLine1
                                : !/^\d{6}$/.test(otpCode.trim())))
                    }
                    style={{ marginTop: 8, padding: 16, fontSize: 16 }}
                >
                    {loading ? (
                        <span className="spinner" style={{ width: 20, height: 20 }} />
                    ) : !online ? (
                        'Connect to sign in'
                    ) : mode === 'login' ? (
                        'Login'
                    ) : registerStep === 'otp' ? (
                        'Verify & create account'
                    ) : otpRequiredHint ? (
                        'Send verification code'
                    ) : (
                        'Register'
                    )}
                </button>

                {!online && state.isLoggedIn && shopSlug && (
                    <Link
                        to={`/${shopSlug}/${redirect || 'cart'}`}
                        style={{ display: 'block', marginTop: 16, color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}
                    >
                        Continue to cart →
                    </Link>
                )}

                <button
                    style={{
                        marginTop: 16, color: 'var(--primary)',
                        fontSize: 14, background: 'none', border: 'none',
                        fontWeight: 'bold', cursor: 'pointer'
                    }}
                    onClick={() => {
                        setMode(mode === 'login' ? 'register' : 'login');
                        setRegisterStep('details');
                        setOtpCode('');
                    }}
                >
                    {mode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
                </button>
            </div>
        </div>
    );
}
