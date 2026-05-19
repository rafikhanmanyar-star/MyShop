import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { siteConfig } from '../config/site';

const nav = [
  { href: '#products', label: 'Products' },
  { href: '#order', label: 'How to order' },
  { href: '#features', label: 'Features' },
  { href: '#business', label: 'For business' },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="section-pad flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2.5 font-semibold text-foreground">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl shadow-sm" />
          <span>{siteConfig.brandName}</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-zinc-600 transition hover:text-foreground dark:text-zinc-400"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={siteConfig.shopOrderUrl}
            className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Order now
          </a>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-zinc-700 md:hidden dark:text-zinc-300"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-zinc-100 bg-white px-4 py-4 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a
            href={siteConfig.shopOrderUrl}
            className="mt-3 block rounded-full bg-foreground py-3 text-center text-sm font-semibold text-background"
          >
            Order now
          </a>
        </div>
      )}
    </header>
  );
}
