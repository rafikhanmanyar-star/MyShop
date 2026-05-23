import { siteConfig } from '@/lib/data';

interface LogoProps {
  variant?: 'light' | 'dark';
  showText?: boolean;
}

export default function Logo({ showText = false }: LogoProps) {
  return (
    <div className="flex items-center" role="img" aria-label={`${siteConfig.name} logo`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={siteConfig.logo}
        alt={`${siteConfig.name} logo`}
        width={167}
        height={170}
        className="h-11 w-auto max-w-[140px] object-contain sm:h-12 sm:max-w-[160px]"
        decoding="async"
      />
      {showText && <span className="sr-only">{siteConfig.brand}</span>}
    </div>
  );
}
