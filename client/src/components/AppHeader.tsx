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
      className={`mb-6 flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 sm:gap-3 ${className}`}
    >
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-colors duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" strokeWidth={2} />
      </button>

      <ThemeToggle />

      {user && (
        <div className="flex min-w-0 max-w-[min(100%,16rem)] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-card dark:border-gray-700 dark:bg-gray-800 sm:max-w-xs sm:px-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-700/25 dark:text-primary-300"
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
