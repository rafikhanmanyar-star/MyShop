import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi } from '../api';
import { useRider } from '../context/RiderContext';

export default function Login() {
  const nav = useNavigate();
  const { setSession, token } = useRider();
  const [shopSlug, setShopSlug] = useState('');
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
    const slug = shopSlug.trim().toLowerCase();
    if (!slug || !phone.trim() || !password) {
      setErr('Shop slug, phone, and password are required.');
      return;
    }
    setLoading(true);
    try {
      const data = await riderApi.login({
        shopSlug: slug,
        phone: phone.trim(),
        password,
      });
      setSession({
        shopSlug: slug,
        token: data.token,
        riderName: data.name ?? null,
        riderId: data.riderId ?? null,
      });
      nav('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Rider</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
        Sign in with the phone and 4-character password your shop set for you.
      </p>
      <form onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Shop URL slug</label>
          <input
            className="input"
            placeholder="e.g. mystore"
            value={shopSlug}
            onChange={(e) => setShopSlug(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Phone</label>
          <input
            className="input"
            type="tel"
            placeholder="03xx / +92…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Password (4 characters)</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err ? <p style={{ color: '#f87171', fontSize: 14, margin: 0 }}>{err}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
