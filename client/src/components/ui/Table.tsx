import React from 'react';

/** Semantic table shell — use with `table-modern` on `<table>` or pass className. */
export function Table({
  children,
  className = '',
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-erp">
      <div className="overflow-x-auto">
        <table className={`table-modern min-w-[640px] ${className}`} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHeaderRow({ children, className = '' }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className}>{children}</tr>;
}

export function TableHead({ children, className = '' }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={className}>{children}</th>;
}

export function TableBody({ children, className = '' }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className = '' }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className}>{children}</tr>;
}

export function TableCell({ children, className = '' }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className}>{children}</td>;
}
