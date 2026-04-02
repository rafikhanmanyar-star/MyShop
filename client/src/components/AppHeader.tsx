import React from 'react';
import { Bell, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ui/ThemeToggle';

/**
 * Top app bar: notifications (placeholder), theme toggle, signed-in user.
 * Uses design tokens so light/dark applies across the shell.
 */
export default function AppHeader({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const roleLabel = user?.role ? user.role.replace(/_/g, ' ') : '';

  return (
    <header
      className={`mb-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border pb-3 sm:gap-3 ${className}`}
    >
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors duration-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" strokeWidth={2} />
      </button>

      <ThemeToggle />

      {user && (
        <div className="flex min-w-0 max-w-[min(100%,16rem)] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-erp sm:max-w-xs sm:px-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
            aria-hidden
          >
            <User className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
      )}
    </header>
  );
}
