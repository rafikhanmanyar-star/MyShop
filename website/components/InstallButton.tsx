import { Download } from '@/components/icons';
import { siteConfig } from '@/lib/data';

interface InstallButtonProps {
  variant?: 'primary' | 'secondary' | 'white' | 'outline';
  className?: string;
  showIcon?: boolean;
}

const variantClasses = {
  primary: 'bg-cta text-white hover:bg-primary',
  secondary: 'bg-white text-text-dark border border-border hover:bg-background',
  white: 'bg-white text-cta hover:bg-white/90',
  outline: 'border border-white/30 bg-transparent text-white hover:bg-white/10',
};

export default function InstallButton({
  variant = 'primary',
  className = '',
  showIcon = true,
}: InstallButtonProps) {
  return (
    <a
      href={siteConfig.shopUrl}
      rel="noopener noreferrer"
      aria-label="Open oBo Store grocery app"
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${variantClasses[variant]} ${className}`}
    >
      {showIcon && <Download className="h-4 w-4" aria-hidden="true" />}
      <span>Install oBo Store</span>
    </a>
  );
}
