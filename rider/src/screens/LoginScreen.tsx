import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';
import { useToast } from '../context/ToastContext';
import { isValidPkPhoneDisplay, normalizePakistanPhone } from '../utils/phone';

const DEFAULT_SHOP = (import.meta.env.VITE_SHOP_SLUG as string | undefined) || '';

export default function LoginScreen() {
  const nav = useNavigate();
  const { setSession, token } = useRider();
  const { showToast } = useToast();
  const [shopSlug, setShopSlug] = useState(() => localStorage.getItem('rider_last_shop_slug') || DEFAULT_SHOP);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    if (token) nav('/', { replace: true });
  }, [token, nav]);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(window.navigator as unknown as { standalone?: boolean }).standalone;
    setShowInstallHint(!standalone);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const slug = shopSlug.trim().toLowerCase();
    if (!slug) {
      setErr('Shop code is required.');
      return;
    }
    if (!isValidPkPhoneDisplay(phone)) {
      setErr('Enter a valid Pakistan number (+92…).');
      return;
    }
    if (!/^[a-zA-Z0-9]{4}$/.test(password)) {
      setErr('Password must be exactly 4 letters or digits.');
      return;
    }
    const normalizedPhone = normalizePakistanPhone(phone);
    if (!normalizedPhone) {
      setErr('Enter a valid Pakistan number (+92…).');
      return;
    }
    setLoading(true);
    try {
      const data = await riderApi.login({
        shopSlug: slug,
        phone: normalizedPhone,
        password,
      });
      try {
        localStorage.setItem('rider_last_shop_slug', slug);
      } catch {
        /* ignore */
      }
      setSession({
        shopSlug: slug,
        token: data.token,
        riderName: data.name ?? null,
        riderId: data.riderId ?? null,
      });
      showToast('Signed in');
      nav('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <h1 className="login-page__title">Rider</h1>
      <p className="login-page__sub">Sign in with your shop code and phone.</p>
      {showInstallHint ? (
        <p className="login-page__hint">
          Tip: Add this app to your home screen for a full-screen shortcut.
        </p>
      ) : null}
      <form onSubmit={submit} className="card login-form">
        <label className="field-label">Shop code</label>
        <input
          className="input"
          placeholder="e.g. mystore"
          value={shopSlug}
          onChange={(e) => setShopSlug(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <label className="field-label">Phone (+92)</label>
        <input
          className="input"
          type="tel"
          inputMode="tel"
          placeholder="+92 3XX XXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
        <label className="field-label">Password (4 characters)</label>
        <input
          className="input"
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
        />
        {err ? <p className="field-error">{err}</p> : null}
        <button type="submit" className="btn btn-primary login-form__submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Log in'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => showToast('Contact your shop admin to reset your rider password.')}
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
