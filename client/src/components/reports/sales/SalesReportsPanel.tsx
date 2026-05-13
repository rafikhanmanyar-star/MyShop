import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { slugifyReportTitle } from '../../../lib/reportSlug';
import { exportReportTable } from '../../../utils/reportExport';
import { roleHasReportPermission } from '../../../lib/reportPermissions';

type Row = {
  id: string;
  day: string;
  branch: string;
  total: number;
  subRows?: Row[];
};

const helper = createColumnHelper<Row>();

const MOCK: Row[] = [
  {
    id: '1',
    day: '2026-05-01',
    branch: 'Flagship',
    total: 12400,
    subRows: [
      { id: '1-1', day: 'SKU-1001', branch: 'Qty 4', total: 3200 },
      { id: '1-2', day: 'SKU-2044', branch: 'Qty 10', total: 9200 },
    ],
  },
  {
    id: '2',
    day: '2026-05-02',
    branch: 'Outlet',
    total: 7800,
    subRows: [{ id: '2-1', day: 'SKU-5510', branch: 'Qty 6', total: 7800 }],
  },
];

const REPORT_NAMES = [
  'Daily Sales Report',
  'Sales by Product',
  'Sales by Category',
  'Sales by Brand',
  'Sales by Customer',
  'Sales by Branch',
  'Sales by Cashier',
  'Sales by Hour',
  'Sales Trend',
  'Top Selling Items',
  'Slow Moving Items',
  'Product Mix Analysis',
  'Discount Analysis',
  'Refund Analysis',
  'Tax Summary',
  'Payment Method Summary',
];

const SalesReportsPanel: React.FC<{ userRole?: string }> = ({ userRole }) => {
  const location = useLocation();
  const qs = location.search || '';
  const [data] = useState(MOCK);
  const canExport = roleHasReportPermission(userRole, 'reports.export');

  const columns = useMemo(
    () => [
      helper.display({
        id: 'exp',
        header: '',
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <button
              type="button"
              className="text-xs font-semibold text-[#0047AB] dark:text-blue-300"
              onClick={row.getToggleExpandedHandler()}
            >
              {row.getIsExpanded() ? '−' : '+'}
            </button>
          ) : null,
        size: 40,
      }),
      helper.accessor('day', { header: 'Day / SKU' }),
      helper.accessor('branch', { header: 'Branch / Qty' }),
      helper.accessor('total', {
        header: 'Total',
        cell: (ctx) => <span className="tabular-nums font-semibold">{ctx.getValue().toLocaleString()}</span>,
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    getRowCanExpand: (row) => Boolean(row.original.subRows?.length),
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
  });

  const exportSample = (fmt: 'csv' | 'xlsx' | 'pdf') => {
    const headers = ['Day', 'Branch', 'Total'];
    const rows = data.map((r) => [r.day, r.branch, r.total]);
    exportReportTable(fmt, 'sales-sample', headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">Sales intelligence</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Enterprise drill paths for basket, tender, voids, and margin — wired to reporting services &amp; warehouse
            aggregates.
          </p>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => exportSample('csv')}>
              CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportSample('xlsx')}>
              Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportSample('pdf')}>
              PDF
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_NAMES.map((name) => {
          const slug = slugifyReportTitle(name);
          const to = `/dashboard/reports/sales/${encodeURIComponent(slug)}${qs}`;
          return (
            <Link key={name} to={to} className="group block min-h-0 outline-none">
              <Card className="h-full border border-slate-200/80 bg-white/80 backdrop-blur-sm transition-shadow hover:border-[#0047AB]/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-500/50">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-[#0047AB] dark:text-slate-100 dark:group-hover:text-blue-300">
                  {name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Server pagination, grouping, and saved layouts supported.
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/70">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sample drill-down (TanStack Table)</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Expand rows for line detail</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-slate-100/80 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-3 py-2">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-700">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="bg-white/80 dark:bg-slate-900/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SalesReportsPanel;
