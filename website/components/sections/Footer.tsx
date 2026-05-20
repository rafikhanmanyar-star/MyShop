import { Facebook, Instagram, Mail, MapPin, Phone, Twitter } from '@/components/icons';
import Logo from '@/components/Logo';
import {
  footerHelp,
  footerQuickLinks,
  footerUtilities,
  siteConfig,
} from '@/lib/data';

export default function Footer() {
  return (
    <footer id="contact" className="bg-dark-navy pt-14 pb-8 text-white">
      <div className="section-container">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Logo variant="light" />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Your trusted smart grocery store in B-17 Islamabad. Order online with fast
              delivery and real-time tracking.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="#"
                aria-label="Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Quick Links</h3>
            <ul className="mt-4 space-y-2.5">
              {footerQuickLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-slate-400 hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Utilities</h3>
            <ul className="mt-4 space-y-2.5">
              {footerUtilities.map((item) => (
                <li key={item}>
                  <span className="text-sm text-slate-400">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Help &amp; Support</h3>
            <ul className="mt-4 space-y-2.5">
              {footerHelp.map((item) => (
                <li key={item}>
                  <span className="text-sm text-slate-400">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Contact Info</h3>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2 text-sm text-slate-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {siteConfig.address}
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
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-slate-500">
          © 2024 {siteConfig.brand}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
