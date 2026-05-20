import { siteConfig } from '@/lib/data';

export default function PromoBar() {
  return (
    <div
      role="region"
      aria-label="Promotional offer"
      className="bg-primary px-4 py-2.5 text-center text-sm text-white"
    >
      <p>
        <span aria-hidden="true">🚚 </span>
        Free delivery on first 3 orders! Use code:{' '}
        <strong className="font-semibold">{siteConfig.promoCode}</strong>
        <span aria-hidden="true"> ✨</span>
      </p>
    </div>
  );
}
