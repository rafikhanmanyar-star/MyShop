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
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="section-pad flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2.5 font-bold text-slate-900">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl shadow-sm" />
          <span>{siteConfig.brandName}</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-medium text-slate-600 hover:text-primary">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={siteConfig.shopOrderUrl}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-primary-dark"
          >
            Order now
          </a>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-700 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 md:hidden">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block py-2.5 text-sm font-medium text-slate-700"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a
            href={siteConfig.shopOrderUrl}
            className="mt-3 block rounded-full bg-primary py-3 text-center text-sm font-semibold text-white"
          >
            Order now
          </a>
        </div>
      )}
    </header>
  );
}
