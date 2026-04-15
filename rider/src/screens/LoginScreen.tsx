import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';
import { useToast } from '../context/ToastContext';
import { isValidPkPhoneDisplay, normalizePakistanPhone } from '../utils/phone';
import { normalizeShopSlugForLookup } from '../utils/shopSlug';

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
    const slug = normalizeShopSlugForLookup(shopSlug);
    if (!slug) {
      setErr('Shop code is required (use the same code as in your store’s ordering link).');
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
    <div className="login-obo">
      <div className="login-obo__brand-row">
        <div className="login-obo__logo" aria-hidden />
        <span className="login-obo__brand-name">OBO RIDER</span>
      </div>

      <h1 className="login-obo__title">
        RIDER
        <br />
        LOGIN
      </h1>
      <p className="login-obo__version">Precision Logistics Terminal v4.2</p>

      {showInstallHint ? <p className="login-obo__hint">Add this app to your home screen for a full-screen shortcut.</p> : null}

      <form onSubmit={submit} className="login-obo__form">
        <label className="login-obo__label">SHOP CODE</label>
        <p className="login-obo__field-hint">Same as your mobile ordering URL (path after /), or paste the full link.</p>
        <div className="obo-field">
          <input
            className="obo-field__input"
            placeholder="e.g. mystore"
            value={shopSlug}
            onChange={(e) => setShopSlug(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <span className="obo-field__icon obo-field__icon--store" aria-hidden />
        </div>

        <label className="login-obo__label">PHONE NUMBER</label>
        <div className="obo-field">
          <span className="obo-field__prefix">+92</span>
          <input
            className="obo-field__input obo-field__input--phone"
            type="tel"
            inputMode="tel"
            placeholder="300 0000000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
          <span className="obo-field__icon obo-field__icon--phone" aria-hidden />
        </div>

        <label className="login-obo__label">4-DIGIT ACCESS PIN</label>
        <div className="obo-field">
          <input
            className="obo-field__input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
            placeholder="••••"
          />
          <span className="obo-field__icon obo-field__icon--key" aria-hidden />
        </div>

        {err ? <p className="login-obo__err">{err}</p> : null}

        <button type="submit" className="login-obo__submit" disabled={loading}>
          {loading ? 'SIGNING IN…' : 'LOGIN'}
          {!loading ? <span className="login-obo__chev" aria-hidden /> : null}
        </button>

        <div className="login-obo__links">
          <button
            type="button"
            className="login-obo__link"
            onClick={() => showToast('Contact your shop admin to reset your rider password.')}
          >
            FORGOT PIN?
          </button>
          <button type="button" className="login-obo__link" onClick={() => showToast('Support: contact your shop administrator.')}>
            SUPPORT
          </button>
        </div>
      </form>

      <div className="login-obo__terminal">
        <div className="login-obo__terminal-head">TERMINAL STATUS</div>
        <p className="login-obo__terminal-body">
          <span className="login-obo__dot" /> ALL SYSTEMS OPERATIONAL
        </p>
      </div>

      <footer className="login-obo__footer">
        <p>SECURE ENTERPRISE CONNECTION · AES-256 ENCRYPTED</p>
        <p>© {new Date().getFullYear()} OBO STORES LOGISTICS DIVISION · BUILD RIDER-PAK</p>
        <p className="login-obo__legal">
          <span>LEGAL</span> · <span>PRIVACY</span> · <span>SAFETY</span>
        </p>
      </footer>
    </div>
  );
}
