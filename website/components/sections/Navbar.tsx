'use client';

import { useState } from 'react';
import { Menu, X } from '@/components/icons';
import Logo from '@/components/Logo';
import InstallButton from '@/components/InstallButton';
import { navLinks } from '@/lib/data';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white">
      <nav className="section-container flex h-16 items-center justify-between" aria-label="Main navigation">
        <a href="#home" aria-label="oBo store home">
          <Logo />
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={`text-sm font-medium ${
                  link.label === 'Home' ? 'text-primary' : 'text-muted hover:text-text-dark'
                }`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <InstallButton />
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-text-dark md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border bg-white px-4 py-4 md:hidden">
          <ul className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block py-2 text-sm font-medium text-text-dark"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <InstallButton className="w-full" />
          </div>
        </div>
      )}
    </header>
  );
}
