import { ShoppingBag } from '@/components/icons';
import { siteConfig } from '@/lib/data';

interface LogoProps {
  variant?: 'light' | 'dark';
  showText?: boolean;
}

export default function Logo({ variant = 'dark', showText = true }: LogoProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-text-dark';

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      {showText && (
        <span className={`text-lg font-bold tracking-tight ${textColor}`}>
          {siteConfig.brand}
        </span>
      )}
    </div>
  );
}
