import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Store, Eye, EyeOff } from 'lucide-react';
import { getQrParamsFromUrl } from '../utils/urlParams';
import { setAppContext, getAppContext } from '../services/appContext';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const qr = getQrParamsFromUrl();
    if (qr) {
      setAppContext({
        organization_id: qr.org_id,
        branch_id: qr.branch_id,
        selected_by_qr: true,
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ctx = getAppContext();
      await login(username, password, ctx.organization_id || undefined);
    } catch (err: any) {
      setError(err.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground transition-colors duration-300">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Store className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">MyShop</h1>
          <p className="mt-1 text-muted-foreground">POS & Inventory Management</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-erp-md">
          <h2 className="mb-6 text-xl font-semibold text-foreground">Sign in to your account</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input pr-10"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-muted-foreground">Don&apos;t have an account? </span>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-sm font-medium text-primary hover:underline"
            >
              Create one
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
