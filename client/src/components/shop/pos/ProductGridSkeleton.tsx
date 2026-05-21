import React from 'react';
import { POS_CATALOG_GRID_GAP_PX } from './posProductCardUtils';

type ProductGridSkeletonProps = {
    columnCount: number;
    rowCount?: number;
};

export default function ProductGridSkeleton({ columnCount, rowCount = 4 }: ProductGridSkeletonProps) {
    const cells = columnCount * rowCount;
    return (
        <div
            className="grid px-3.5 animate-pulse"
            style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: POS_CATALOG_GRID_GAP_PX,
            }}
        >
            {Array.from({ length: cells }).map((_, i) => (
                <div
                    key={i}
                    className="flex flex-col rounded-2xl border border-slate-100 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
                >
                    <div className="h-[120px] rounded-xl bg-slate-100 dark:bg-slate-700/60" />
                    <div className="mt-2 h-10 rounded-lg bg-slate-100 dark:bg-slate-700/60" />
                    <div className="mt-2 flex justify-between gap-2">
                        <div className="h-5 w-16 rounded bg-slate-100 dark:bg-slate-700/60" />
                        <div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-700/60" />
                    </div>
                </div>
            ))}
        </div>
    );
}
