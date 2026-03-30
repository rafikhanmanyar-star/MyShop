import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'bg-muted text-foreground',
  success: 'bg-emerald-500/15 text-success',
  warning: 'bg-amber-500/15 text-warning',
  destructive: 'bg-red-500/15 text-destructive',
  outline: 'border border-border bg-transparent text-muted-foreground',
};

export default function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span className={`badge ${variantClass[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
