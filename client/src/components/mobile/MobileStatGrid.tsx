import React from 'react';

export type MobileStatTile = {
  label: string;
  value: string;
  hint?: string;
  /** Full-width featured metric */
  featured?: boolean;
};

export default function MobileStatGrid({ tiles, loading }: { tiles: MobileStatTile[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 h-24 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile) => {
        const featured = !!tile.featured;
        return (
          <div
            key={tile.label}
            className={`relative overflow-hidden rounded-2xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card ${
              tile.featured
                ? 'col-span-2 border-[#4A90E2]/25 bg-gradient-to-br from-[#4A90E2]/8 via-white to-white dark:from-[#4A90E2]/10 dark:via-card dark:to-card'
                : 'border-gray-100 dark:border-gray-700/80'
            }`}
          >
            {featured && (
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#4A90E2]/10 dark:bg-[#4A90E2]/15" />
            )}
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
              {tile.label}
            </p>
            <p
              className={`mt-1 font-bold tabular-nums tracking-tight text-[#212529] dark:text-foreground ${
                featured ? 'text-2xl' : 'text-lg'
              }`}
            >
              {tile.value}
            </p>
            {tile.hint ? (
              <p className="mt-1 text-xs leading-snug text-[#6C757D] dark:text-muted-foreground">{tile.hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
