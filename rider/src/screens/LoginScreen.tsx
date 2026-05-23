import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';
import { useToast } from '../context/ToastContext';
import { isValidPkPhoneDisplay, normalizePakistanPhone } from '../utils/phone';
import { normalizeShopSlugForLookup } from '../utils/shopSlug';
import { registerRiderPushNotifications } from '../lib/pushSubscribe';

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

  useEffect(() => {
    if (token) nav('/', { replace: true });
  }, [token, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const slug = normalizeShopSlugForLookup(shopSlug);
    if (!slug) {
      setErr('Enter your shop code (same as your ordering URL).');
      return;
    }
    if (!isValidPkPhoneDisplay(phone)) {
      setErr('Enter a valid Pakistan mobile number.');
      return;
    }
    if (!/^[a-zA-Z0-9]{4}$/.test(password)) {
      setErr('PIN must be 4 characters.');
      return;
    }
    const normalizedPhone = normalizePakistanPhone(phone);
    if (!normalizedPhone) {
      setErr('Invalid phone number.');
      return;
    }
    setLoading(true);
    try {
      const data = await riderApi.login({ shopSlug: slug, phone: normalizedPhone, password });
      localStorage.setItem('rider_last_shop_slug', slug);
      setSession({
        shopSlug: slug,
        token: data.token,
        riderName: data.name ?? null,
        riderId: data.riderId ?? null,
      });
      showToast('Welcome back');
      void registerRiderPushNotifications();
      nav('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="r-login">
      <div className="r-login__logo" aria-hidden />
      <h1>MyShop Rider</h1>
      <p className="r-login__sub">Enterprise delivery — sign in with your shop code and rider PIN</p>

      <form onSubmit={submit}>
        <div className="r-field">
          <label>Shop code</label>
          <input
            placeholder="e.g. mystore"
            value={shopSlug}
            onChange={(e) => setShopSlug(e.target.value)}
            autoCapitalize="off"
          />
        </div>
        <div className="r-field">
          <label>Phone (+92)</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="300 1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="r-field">
          <label>4-digit PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
          />
        </div>
        {err ? <p style={{ color: 'var(--r-danger)', fontWeight: 600 }}>{err}</p> : null}
        <button type="submit" className="r-btn r-btn--primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ marginTop: 24, fontSize: 13, color: 'var(--r-muted)', textAlign: 'center' }}>
        Contact your shop admin to reset PIN or register a device.
      </p>
    </div>
  );
}
