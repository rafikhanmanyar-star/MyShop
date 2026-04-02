import React, { ReactNode } from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClass = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', ...props }) => {
  return (
    <div
      className={`card ${paddingClass[padding]} transition-shadow duration-200 hover:shadow-soft ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
