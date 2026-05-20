import Link from 'next/link';
import { Facebook, Instagram, Mail, MapPin, Phone, Twitter } from '@/components/icons';
import Logo from '@/components/Logo';
import { footerPolicyLinks, footerQuickLinks, siteConfig } from '@/lib/data';

export default function Footer() {
  return (
    <footer className="bg-dark-navy pt-14 pb-8 text-white">
      <div className="section-container">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="light" />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              oBo store — grocery store and delivery in B-17 Islamabad. FMC B-17 Kohsar Plaza,
              Main Boulevard. Install our smart grocery app for fast delivery and live
              tracking.
            </p>
            <div className="mt-5 flex gap-3" aria-label="Social media links">
              <span
                role="img"
                className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg bg-white/10 text-white/50"
                aria-label="Facebook page coming soon"
                title="Facebook coming soon"
              >
                <Facebook className="h-4 w-4" aria-hidden="true" />
              </span>
              <span
                role="img"
                className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg bg-white/10 text-white/50"
                aria-label="Instagram page coming soon"
                title="Instagram coming soon"
              >
                <Instagram className="h-4 w-4" aria-hidden="true" />
              </span>
              <span
                role="img"
                className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg bg-white/10 text-white/50"
                aria-label="Twitter page coming soon"
                title="Twitter coming soon"
              >
                <Twitter className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          </div>

          <nav aria-label="Explore">
            <h2 className="text-sm font-semibold">Explore</h2>
            <ul className="mt-4 space-y-2.5">
              {footerQuickLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-slate-400 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Policies and help">
            <h2 className="text-sm font-semibold">Policies &amp; help</h2>
            <ul className="mt-4 space-y-2.5">
              {footerPolicyLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-slate-400 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div id="contact">
            <h2 className="text-sm font-semibold">Contact oBo Store</h2>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2 text-sm text-slate-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <address className="not-italic">
                  {siteConfig.address}
                  <br />
                  {siteConfig.addressLine2}
                </address>
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-400">
                <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`tel:${siteConfig.phone.replace(/\s/g, '')}`} className="hover:text-white">
                  {siteConfig.phone}
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-400">
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`mailto:${siteConfig.email}`} className="hover:text-white">
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <Link href="/contact" className="text-sm font-medium text-primary-on-dark hover:text-white">
                  Visit our contact page
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} {siteConfig.brand}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
