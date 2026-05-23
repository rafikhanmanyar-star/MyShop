import Link from 'next/link';
import BackToTop from '@/components/BackToTop';
import {
  Facebook,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Twitter,
  Youtube,
} from '@/components/icons';
import Logo from '@/components/Logo';
import {
  footerHelpLinks,
  footerQuickLinks,
  footerUtilityLinks,
  siteConfig,
} from '@/lib/data';

const socialLinks = [
  { icon: Facebook, label: 'Facebook page coming soon' },
  { icon: Instagram, label: 'Instagram page coming soon' },
  { icon: MessageCircle, label: 'WhatsApp coming soon' },
  { icon: Twitter, label: 'Twitter page coming soon' },
  { icon: Youtube, label: 'YouTube channel coming soon' },
] as const;

export default function Footer() {
  return (
    <>
      <footer
        className="bg-dark-navy pt-14 pb-8 text-white"
        data-nosnippet
        aria-label="Site footer"
      >
        <div className="section-container">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <Logo variant="light" />
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Smart grocery shopping for B-17 Islamabad. Visit us at Kohsar Plaza or order through
                our PWA.
              </p>
              <div className="mt-5 flex flex-wrap gap-3" aria-label="Social media links">
                {socialLinks.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    role="img"
                    className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full bg-white/10 text-white/50"
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                ))}
              </div>
            </div>

            <nav aria-label="Quick links">
              <h2 className="text-sm font-semibold">Quick Links</h2>
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

            <nav aria-label="Utilities">
              <h2 className="text-sm font-semibold">Utilities</h2>
              <ul className="mt-4 space-y-2.5">
                {footerUtilityLinks.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-slate-400 hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Help and support">
              <h2 className="text-sm font-semibold">Help &amp; Support</h2>
              <ul className="mt-4 space-y-2.5">
                {footerHelpLinks.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-slate-400 hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div id="contact">
              <h2 className="text-sm font-semibold">Contact Info</h2>
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
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} {siteConfig.brand}. All rights reserved.
          </div>
        </div>
      </footer>
      <BackToTop />
    </>
  );
}
