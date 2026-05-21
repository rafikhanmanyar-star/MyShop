import { siteConfig } from '@/lib/data';

export default function StoreMap() {
  const { latitude, longitude } = siteConfig.geo;
  const embedSrc = `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;

  return (
    <figure className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
      <iframe
        title={`${siteConfig.name} location at ${siteConfig.schemaAddress}`}
        src={embedSrc}
        className="aspect-[4/3] h-auto w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <figcaption className="sr-only">
        Map showing oBo Store at {siteConfig.address}, {siteConfig.addressLine2}
      </figcaption>
    </figure>
  );
}
