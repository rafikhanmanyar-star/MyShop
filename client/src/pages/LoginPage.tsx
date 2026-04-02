import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Eye, EyeOff, Building2 } from 'lucide-react';
import { getLoginOrgParamsFromUrl } from '../utils/urlParams';
import { setAppContext, getAppContext } from '../services/appContext';
import { authApi, type PublicOrganizationInfo } from '../services/authApi';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [orgInfo, setOrgInfo] = useState<PublicOrganizationInfo | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgLookupFailed, setOrgLookupFailed] = useState(false);

  useEffect(() => {
    const { org_id, branch_id } = getLoginOrgParamsFromUrl();
    if (org_id) {
      if (branch_id) {
        setAppContext({ organization_id: org_id, branch_id, selected_by_qr: true });
      } else {
        setAppContext({ organization_id: org_id });
      }
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const { org_id: urlOrg, branch_id: urlBranch } = getLoginOrgParamsFromUrl();
    const ctx = getAppContext();
    const orgId = urlOrg || ctx.organization_id;
    const branchId = urlBranch || ctx.branch_id || null;

    if (!orgId) {
      setOrgInfo(null);
      setOrgLookupFailed(false);
      setOrgLoading(false);
      return;
    }

    let cancelled = false;
    setOrgLoading(true);
    setOrgLookupFailed(false);

    authApi
      .getPublicOrganization(orgId, branchId)
      .then((data) => {
        if (!cancelled) {
          setOrgInfo(data);
          setOrgLookupFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrgInfo(null);
          setOrgLookupFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setOrgLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

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

  const displayOrgName = orgInfo
    ? (orgInfo.company_name?.trim() || orgInfo.name || 'Organization')
    : null;

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
          <h2 className="mb-2 text-xl font-semibold text-foreground">Sign in to your account</h2>

          {orgLoading && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-muted-foreground/30" />
              Loading organization…
            </div>
          )}

          {!orgLoading && orgInfo && displayOrgName && (
            <div className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Signing in to
                  </p>
                  <p className="truncate font-semibold text-foreground">{displayOrgName}</p>
                  {orgInfo.branch_name && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Branch: <span className="font-medium text-foreground">{orgInfo.branch_name}</span>
                    </p>
                  )}
                  {orgInfo.slug && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">@{orgInfo.slug}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!orgLoading && orgLookupFailed && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
              Could not load organization details. Check that your link includes the correct{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">org</code> value, or ask your administrator for
              the right sign-in URL.
            </div>
          )}

          {!orgLoading && !orgInfo && !orgLookupFailed && (
            <p className="mb-4 text-sm text-muted-foreground">
              Open the sign-in link from your organization (or add{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">?org=…</code> to the address bar) so we can show
              which store you are signing in to.
            </p>
          )}

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
