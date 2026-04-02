import React from 'react';

type Props = {
  topSearch: React.ReactNode;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
};

/**
 * Full-height 3-column POS shell: top search + (products | cart | payment).
 */
export default function POSLayout({ topSearch, left, center, right }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <div className="shrink-0 border-b border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">{topSearch}</div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-1/4 min-w-[220px] max-w-md overflow-y-auto border-r border-gray-200 dark:border-gray-700">{left}</div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">{center}</div>
        <div className="w-1/4 min-w-[260px] max-w-md overflow-y-auto">{right}</div>
      </div>
    </div>
  );
}
