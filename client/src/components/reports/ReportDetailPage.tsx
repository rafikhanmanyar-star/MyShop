import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { useReportFilters } from '../../hooks/useReportFilters';
import { roleHasReportPermission } from '../../lib/reportPermissions';
import { reportsApi } from '../../services/reportsApi';
import { exportReportTable } from '../../utils/reportExport';
import { useAuth } from '../../context/AuthContext';
import { isReportCategoryId } from '../../types/reports';
import Button from '../ui/Button';
import Card from '../ui/Card';

const PAGE_SIZE = 100;

const ReportDetailPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { reportCategory = '', reportSlug = '' } = useParams<{ reportCategory: string; reportSlug: string }>();
  const { category, setCategory, filters, range } = useReportFilters();
  const canExport = roleHasReportPermission(user?.role, 'reports.export');

  const [catalogTitle, setCatalogTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof reportsApi.reportData>> | null>(null);

  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const branch = filters.branchId?.trim() || null;
  const from = range.from;
  const to = range.to;

  useEffect(() => {
    if (reportCategory && isReportCategoryId(reportCategory) && reportCategory !== category) {
      setCategory(reportCategory);
    }
  }, [reportCategory, category, setCategory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cat = await reportsApi.catalog();
        const hit = cat.items.find((e) => e.category === reportCategory && e.slug === reportSlug);
        if (!cancelled) setCatalogTitle(hit?.title ?? null);
      } catch {
        if (!cancelled) setCatalogTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportCategory, reportSlug]);

  useEffect(() => {
    setOffset(0);
  }, [reportCategory, reportSlug, from, to, branch]);

  useEffect(() => {
    if (!reportCategory || !reportSlug) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      setErr('Pick a valid date range using the filters above.');
      setPayload(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await reportsApi.reportData({
          category: reportCategory,
          slug: reportSlug,
          from,
          to,
          branchId: branch,
          limit: PAGE_SIZE,
          offset,
        });
        if (!cancelled) setPayload(res);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || e?.error || 'Failed to load report');
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportCategory, reportSlug, from, to, branch, offset]);

  useEffect(() => {
    if (!exportJobId) return;
    let cancelled = false;
    let intervalId = 0;
    const tick = async () => {
      try {
        const j = await reportsApi.getExportJob(exportJobId);
        if (cancelled) return;
        setExportStatus(j.status);
        if (j.status === 'failed') {
          setExportErr(j.errorMessage || 'Export failed');
        }
        if (j.status === 'completed' || j.status === 'failed') {
          window.clearInterval(intervalId);
        }
      } catch (e: any) {
        if (!cancelled) setExportErr(e?.message || 'Poll failed');
      }
    };
    void tick();
    intervalId = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [exportJobId]);

  const hubHref = `/dashboard/reports${location.search}`;

  const onClientCsv = useCallback(() => {
    if (!payload?.columns?.length) return;
    const headers = payload.columns;
    const rows = payload.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
    exportReportTable('csv', `${reportCategory}-${reportSlug}`, headers, rows);
  }, [payload, reportCategory, reportSlug]);

  const onQueueServerCsv = async () => {
    if (!canExport || !reportCategory || !reportSlug) return;
    setExportErr(null);
    setExportStatus('pending');
    try {
      const out = await reportsApi.queueReportExport({
        format: 'csv',
        reportCategory,
        reportSlug,
        from,
        to,
        branchId: branch,
      });
      setExportJobId(out.id);
      setExportStatus(out.status || 'pending');
    } catch (e: any) {
      setExportErr(e?.message || 'Could not queue export');
      setExportStatus(null);
    }
  };

  const onDownloadServerCsv = async () => {
    if (!exportJobId) return;
    try {
      const blob = await reportsApi.downloadExportBlob(exportJobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportJobId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportErr(e?.message || 'Download failed');
    }
  };

  const title = catalogTitle || `${reportCategory} / ${reportSlug}`;
  const total = payload?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={hubHref}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0047AB] hover:underline dark:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to library
          </Link>
          <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Range {from} → {to}
            {branch ? ` · Branch ${branch}` : ' · All branches'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!payload?.rows?.length} onClick={onClientCsv}>
            <Download className="h-4 w-4" />
            Current page (CSV)
          </Button>
          {canExport && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={onQueueServerCsv}>
                Queue full CSV (async)
              </Button>
              {exportJobId && exportStatus === 'completed' && (
                <Button type="button" variant="outline" size="sm" onClick={onDownloadServerCsv}>
                  Download export
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {(exportStatus || exportErr) && (
        <Card className="border border-slate-200/80 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
          {exportErr && <p className="font-medium text-red-600 dark:text-red-400">{exportErr}</p>}
          {exportJobId && (
            <p className="text-slate-700 dark:text-slate-300">
              Job <span className="font-mono text-xs">{exportJobId}</span>
              {exportStatus ? ` — ${exportStatus}` : ''}
            </p>
          )}
        </Card>
      )}

      {err && (
        <Card className="border border-amber-200 bg-amber-50/90 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {err}
        </Card>
      )}

      <Card className="border border-slate-200/80 bg-white/90 dark:border-slate-700 dark:bg-slate-950/70">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {total > 0 ? `Rows ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : loading ? 'Loading…' : 'No rows'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canPrev || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              Previous
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canNext || loading} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
              Next
            </Button>
          </div>
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-slate-950/50">
              <Loader2 className="h-8 w-8 animate-spin text-[#0047AB]" aria-label="Loading" />
            </div>
          )}
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-slate-100/80 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                {(payload?.columns || []).map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-700">
              {(payload?.rows || []).map((row, i) => (
                <tr key={`${offset}-${i}`} className="bg-white/80 dark:bg-slate-900/40">
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-[280px] truncate px-3 py-2 tabular-nums text-slate-800 dark:text-slate-200">
                      {cell === null || cell === undefined ? '' : String(cell)}
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

export default ReportDetailPage;
