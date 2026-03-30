import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Store, Eye, EyeOff } from 'lucide-react';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', companyName: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err: any) {
      setError(err.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

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
          <p className="mt-1 text-muted-foreground">Create your account</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-erp-md">
          <h2 className="mb-6 text-xl font-semibold text-foreground">Register</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                required
                className="input"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Company / Shop Name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => update('companyName', e.target.value)}
                className="input"
                placeholder="Your shop name (optional)"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                required
                className="input"
                placeholder="Choose a username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  required
                  className="input pr-10"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
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
            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-muted-foreground">Already have an account? </span>
            <button type="button" onClick={onSwitchToLogin} className="text-sm font-medium text-primary hover:underline">
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
