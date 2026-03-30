import React, { ReactNode } from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClass = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', ...props }) => {
  return (
    <div
      className={`card ${paddingClass[padding]} hover:shadow-erp-md ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
