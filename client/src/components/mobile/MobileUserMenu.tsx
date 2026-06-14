import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Download, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';

function getUserInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function MobileUserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { canInstall, promptInstall } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  const roleLabel = user.role.replace(/_/g, ' ');

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[9.5rem] items-center gap-2 rounded-xl border border-gray-200/90 bg-white py-1 pl-1 pr-2 shadow-sm transition hover:border-[#4A90E2]/40 hover:shadow dark:border-gray-600 dark:bg-gray-800/90 sm:max-w-[11rem]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#4A90E2] to-[#357abd] text-xs font-bold text-white shadow-sm">
          {getUserInitials(user.name)}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-semibold leading-tight text-[#212529] dark:text-foreground">
            {user.name}
          </span>
          <span className="block truncate text-[0.6rem] font-medium uppercase tracking-wide text-[#6C757D] dark:text-muted-foreground">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#6C757D] transition-transform dark:text-muted-foreground ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900"
        >
          <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
            <p className="truncate text-sm font-semibold text-[#212529] dark:text-foreground">{user.name}</p>
            <p className="text-xs capitalize text-[#6C757D] dark:text-muted-foreground">{roleLabel}</p>
          </div>
          <div className="p-1">
            {canInstall && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void promptInstall();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#4A90E2] hover:bg-[#4A90E2]/5 dark:hover:bg-[#4A90E2]/10"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                Install app
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#212529] hover:bg-gray-50 dark:text-foreground dark:hover:bg-gray-800"
            >
              <Settings className="h-4 w-4 text-[#6C757D]" strokeWidth={2} />
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout();
                navigate('/');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
