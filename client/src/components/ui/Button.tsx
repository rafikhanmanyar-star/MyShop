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
    'font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 rounded-md select-none focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] dark:focus:ring-offset-gray-900';

  const sizeClasses = {
    default: 'px-4 py-2 text-sm min-h-[44px] sm:min-h-0',
    sm: 'px-3 py-1.5 text-xs min-h-[44px] sm:min-h-0',
    icon: 'p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0',
  };

  const variantClasses = {
    primary:
      'bg-primary-600 text-white hover:bg-primary-700 shadow-sm focus:ring-primary-500/40',
    secondary:
      'border border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500/40',
    ghost:
      'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
    outline:
      'border border-gray-200 bg-transparent text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800/80',
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
