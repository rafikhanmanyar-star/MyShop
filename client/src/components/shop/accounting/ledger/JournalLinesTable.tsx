import React, { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { JournalLineRow } from './types';

export interface DisplayLine extends JournalLineRow {
  /** Preformatted "CODE — Name" */
  label: string;
}

const helper = createColumnHelper<DisplayLine>();

interface JournalLinesTableProps {
  lines: DisplayLine[];
}

export const JournalLinesTable: React.FC<JournalLinesTableProps> = ({ lines }) => {
  const columns = useMemo(
    () => [
      helper.accessor('label', {
        header: () => <span className="text-muted-foreground">Account</span>,
        cell: (info) => (
          <div className="border-l-[3px] border-indigo-400 pl-3 text-sm font-medium text-foreground dark:border-indigo-500 dark:text-[#E5E7EB]">
            {info.getValue()}
          </div>
        ),
      }),
      helper.accessor('debit', {
        header: () => <span className="sr-only md:not-sr-only">Debit</span>,
        meta: { align: 'right' as const },
        cell: (info) => {
          const v = Number(info.getValue()) || 0;
          return (
            <div className="text-right font-mono text-sm font-semibold tabular-nums text-foreground dark:text-[#E5E7EB]">
              {v > 0 ? v.toLocaleString() : '—'}
            </div>
          );
        },
      }),
      helper.accessor('credit', {
        header: () => <span className="sr-only md:not-sr-only">Credit</span>,
        meta: { align: 'right' as const },
        cell: (info) => {
          const v = Number(info.getValue()) || 0;
          return (
            <div className="text-right font-mono text-sm font-semibold tabular-nums text-muted-foreground dark:text-[#94A3B8]">
              {v > 0 ? v.toLocaleString() : '—'}
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: lines,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white dark:border-[#1F2937] dark:bg-[#0F172A]">
      <table className="w-full min-w-[320px] text-left text-sm" role="table" aria-label="Journal lines">
        <thead className="bg-muted/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:bg-slate-800/90 dark:text-[#94A3B8]">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id} className="px-4 py-3">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#1F2937]">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2.5 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
