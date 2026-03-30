import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
}

const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'default',
  ...props
}) => {
  const baseClasses =
    'font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 rounded-xl select-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-95 dark:focus:ring-offset-background';

  const sizeClasses = {
    default: 'px-3 py-2.5 sm:py-2 text-sm min-h-[44px] sm:min-h-0',
    sm: 'px-2 py-2 sm:py-1.5 text-xs min-h-[44px] sm:min-h-0',
    icon: 'p-2.5 sm:p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0',
  };

  const variantClasses = {
    primary:
      'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm',
    secondary:
      'border border-border bg-card text-foreground hover:bg-accent hover:text-primary',
    danger: 'bg-destructive text-white hover:opacity-90',
    ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    outline:
      'border border-border bg-transparent text-foreground hover:bg-accent hover:text-primary',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
