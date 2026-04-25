import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { ArrowLeft, AlertTriangle, Calendar, Search } from 'lucide-react';

type LineState = Record<
  string,
  { qty: string; restock: boolean; reason: string; reasonIsCustom: boolean }
>;

const LINE_REASONS = [
  { value: '', label: 'Select reason…' },
  { value: 'Damaged', label: 'Damaged' },
  { value: 'Wrong item', label: 'Wrong item' },
  { value: 'Quality', label: 'Quality' },
  { value: 'Changed mind', label: 'Changed mind' },
] as const;

const PRESET_REASONS = new Set<string>(
  LINE_REASONS.map((o) => o.value).filter((v) => v !== '')
);

function lineKey(row: { saleLineItemId?: string; mobileOrderLineItemId?: string }) {
  return String(row.saleLineItemId || row.mobileOrderLineItemId || '');
}

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

function SectionCard({
  accent = 'primary' as 'primary' | 'muted',
  children,
  className = '',
}: {
  accent?: 'primary' | 'muted';
  children: React.ReactNode;
  className?: string;
}) {
  const border =
    accent === 'primary' ? 'border-l-primary-600 dark:border-l-primary-500' : 'border-l-slate-300 dark:border-l-slate-600';
  return (
    <section
      className={`rounded-xl border border-border bg-card shadow-[var(--shadow-card-val)] pl-1 overflow-hidden ${border} border-l-4 ${className}`}
    >
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function SalesReturnCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastPrefillInvoice = useRef<string | null>(null);
  const [invoiceInput, setInvoiceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<any>(null);
  const [lineState, setLineState] = useState<LineState>({});
  const [returnType, setReturnType] = useState<'FULL' | 'PARTIAL'>('PARTIAL');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'BANK' | 'WALLET' | 'ADJUSTMENT'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [returnSource, setReturnSource] = useState<'pos' | 'mobile' | null>(null);

  const loadBanks = useCallback(async () => {
    try {
      const b = await shopApi.getBankAccounts(true);
      setBanks(Array.isArray(b) ? b : []);
    } catch {
      setBanks([]);
    }
  }, []);

  const loadEligibility = useCallback(
    async (invoiceOverride?: string) => {
      const inv = (invoiceOverride ?? invoiceInput).trim();
      if (!inv) {
        setError('Enter an invoice / sale number');
        return;
      }
      setLoading(true);
      setError(null);
      setReturnSource(null);
      try {
        let el: any = null;
        try {
          const sale = await shopApi.getSaleByInvoiceNumber(inv);
          if (sale?.id) {
            el = await shopApi.getSaleReturnEligibility(sale.id);
            setReturnSource('pos');
          }
        } catch {
          // Not a POS invoice — try mobile order number
        }
        if (!el) {
          try {
            el = await shopApi.getMobileOrderReturnEligibility(inv);
            if (el?.source === 'mobile') setReturnSource('mobile');
          } catch {
            el = null;
          }
        }
        if (!el) {
          setEligibility(null);
          setError('No POS sale or mobile order found for this number');
          return;
        }
        setEligibility(el);
        const next: LineState = {};
        for (const row of el?.items || []) {
          const k = lineKey(row);
          if (!k) continue;
          next[k] = {
            qty: '0',
            restock: true,
            reason: '',
            reasonIsCustom: false,
          };
        }
        setLineState(next);
      } catch (e: any) {
        setEligibility(null);
        setError(e?.error || e?.message || 'Failed to load sale');
      } finally {
        setLoading(false);
      }
    },
    [invoiceInput]
  );

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    const inv = (location.state as { prefillInvoice?: string } | null | undefined)?.prefillInvoice?.trim();
    if (!inv) {
      lastPrefillInvoice.current = null;
      return;
    }
    if (lastPrefillInvoice.current === inv) return;
    lastPrefillInvoice.current = inv;
    setInvoiceInput(inv);
    void loadEligibility(inv);
  }, [location.state, loadEligibility]);

  const totalReturn = useMemo(() => {
    if (!eligibility?.items?.length) return 0;
    let sum = 0;
    for (const row of eligibility.items) {
      const st = lineState[lineKey(row)];
      const q = parseFloat(st?.qty || '0') || 0;
      const sold = Number(row.soldQty) || 0;
      const lineSub = Number(row.lineSubtotal) || 0;
      if (q <= 0 || sold <= 0) continue;
      sum += (lineSub / sold) * q;
    }
    return Math.round(sum * 100) / 100;
  }, [eligibility, lineState]);

  const updateLine = (saleLineItemId: string, patch: Partial<LineState[string]>) => {
    setLineState((prev) => ({
      ...prev,
      [saleLineItemId]: { ...prev[saleLineItemId], ...patch },
    }));
  };

  const applyFullQuantities = () => {
    if (!eligibility?.items) return;
    const next: LineState = { ...lineState };
    for (const row of eligibility.items) {
      const k = lineKey(row);
      const avail = Number(row.availableToReturn) || 0;
      next[k] = {
        qty: avail > 0 ? String(avail) : '0',
        restock: next[k]?.restock ?? true,
        reason: next[k]?.reason || '',
        reasonIsCustom: next[k]?.reasonIsCustom ?? false,
      };
    }
    setLineState(next);
    setReturnType('FULL');
  };

  const submit = async () => {
    if (!eligibility?.sale?.id) return;
    if (eligibility.blocked) {
      setError(eligibility.blockReason || 'Cannot return this sale');
      return;
    }
    const items: any[] = [];
    const isMobile = returnSource === 'mobile' || eligibility.source === 'mobile';
    for (const row of eligibility.items) {
      const k = lineKey(row);
      const st = lineState[k];
      const q = parseFloat(st?.qty || '0') || 0;
      if (q <= 0) continue;
      const avail = Number(row.availableToReturn) || 0;
      if (q > avail + 1e-6) {
        setError(`Return qty exceeds available for ${row.productName || 'a line'}`);
        return;
      }
      const reasonTrim = (st?.reason || '').trim();
      if (isMobile) {
        items.push({
          mobileOrderLineItemId: row.mobileOrderLineItemId,
          quantity: q,
          restock: st?.restock !== false,
          reason: reasonTrim || undefined,
        });
      } else {
        items.push({
          saleLineItemId: row.saleLineItemId,
          quantity: q,
          restock: st?.restock !== false,
          reason: reasonTrim || undefined,
        });
      }
    }
    if (items.length === 0) {
      setError('Enter at least one line with return quantity');
      return;
    }
    if (refundMethod === 'BANK' && !bankAccountId) {
      setError('Select a bank account for BANK refund');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        returnType,
        refundMethod,
        bankAccountId: refundMethod === 'BANK' ? bankAccountId : refundMethod === 'CASH' ? undefined : undefined,
        notes: notes.trim() || undefined,
        items,
      };
      if (isMobile) {
        payload.originalMobileOrderId = eligibility.sale.id;
      } else {
        payload.originalSaleId = eligibility.sale.id;
      }
      const res = await shopApi.createSalesReturn(payload);
      navigate(`/sales-returns/${res.id}`);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to create return');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const blocked = eligibility?.blocked;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12 rounded-2xl border border-border/80 bg-muted/20 dark:bg-slate-900/20 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <Link
            to="/sales-returns"
            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Back to sales returns"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">+ New Return</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Look up a POS invoice or mobile order, set line reasons and FULL / PARTIAL type, then choose how the refund
              is settled—matching your returns dashboard.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="inline-flex items-start gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 dark:bg-red-950/30 dark:border-red-900 dark:text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <SectionCard>
        <div className="flex flex-col gap-1 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Step 1 · Original sale</span>
          <p className="text-sm text-muted-foreground">Enter the invoice or order number, then load eligible lines.</p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Invoice / order #</label>
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 dark:bg-slate-900/40 px-4 py-2 focus-within:ring-2 focus-within:ring-primary-500/25">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void loadEligibility()}
                placeholder="e.g. INV-00042 or MO-1024"
                className="flex-1 min-w-0 bg-transparent border-none text-sm p-0 focus:ring-0 placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void loadEligibility()}
            disabled={loading}
            className="rounded-full gap-2 bg-primary-900 hover:bg-primary-950 dark:bg-primary-700 dark:hover:bg-primary-600 shadow-sm shrink-0"
          >
            {loading ? 'Loading…' : 'Load sale'}
          </Button>
        </div>
        {eligibility?.sale && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {(returnSource === 'mobile' || eligibility.source === 'mobile') && (
              <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                Mobile
              </span>
            )}
            {(returnSource === 'pos' || eligibility.source === 'pos') && (
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                POS
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Total {CURRENCY} {formatMoney(parseFloat(eligibility.sale.grandTotal) || 0)}
            </span>
            <span>
              Status <strong className="text-foreground">{eligibility.sale.status}</strong>
              {(eligibility.sale as any).paymentStatus != null && (
                <>
                  {' '}
                  · Payment <strong className="text-foreground">{(eligibility.sale as any).paymentStatus}</strong>
                </>
              )}
            </span>
          </div>
        )}
      </SectionCard>

      {eligibility && (
        <>
          {blocked && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              {eligibility.blockReason || 'Returns are not allowed for this sale.'}
            </div>
          )}

          <SectionCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Step 2 · Lines</span>
                <p className="text-sm text-muted-foreground mt-0.5">Quantities, restock, and reason per SKU.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full border-border"
                onClick={applyFullQuantities}
                disabled={blocked}
              >
                Fill full return
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 dark:bg-slate-800/60 text-left">
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Product</th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Sold</th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground text-rose-600 dark:text-rose-400">
                      Returned
                    </th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground text-emerald-600 dark:text-emerald-400">
                      Available
                    </th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Return qty</th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">Restock</th>
                    <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[9rem]">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eligibility.items.map((row: any, idx: number) => {
                    const lk = lineKey(row);
                    const st = lineState[lk] || {
                      qty: '0',
                      restock: true,
                      reason: '',
                      reasonIsCustom: false,
                    };
                    const reasonSelectValue =
                      st.reasonIsCustom || (st.reason !== '' && !PRESET_REASONS.has(st.reason))
                        ? '__custom__'
                        : st.reason;
                    const avail = Number(row.availableToReturn) || 0;
                    const ret = Number(row.alreadyReturned) || 0;
                    const zebra = idx % 2 === 0 ? 'bg-[var(--table-zebra)]' : '';
                    return (
                      <tr
                        key={lk}
                        className={`border-b border-border/70 hover:bg-[var(--table-row-hover)] transition-colors ${zebra}`}
                      >
                        <td className="px-4 py-3 font-medium text-foreground max-w-[14rem]">{row.productName}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{row.soldQty}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-rose-600 dark:text-rose-400">{ret}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{avail}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            max={avail}
                            disabled={blocked}
                            className="w-24 rounded-full border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-primary-500/25"
                            value={st.qty}
                            onChange={(e) => updateLine(lk, { qty: e.target.value })}
                            aria-label={`Return quantity for ${row.productName}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={st.restock}
                            disabled={blocked}
                            onChange={(e) => updateLine(lk, { restock: e.target.checked })}
                            className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500/40"
                            title={`Restock ${row.productName}`}
                            aria-label={`Restock ${row.productName} on return`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={blocked}
                            className="w-full rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-primary-500/25"
                            value={reasonSelectValue}
                            aria-label={`Return reason for ${row.productName}`}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__custom__') {
                                updateLine(lk, { reasonIsCustom: true, reason: '' });
                              } else {
                                updateLine(lk, { reasonIsCustom: false, reason: v });
                              }
                            }}
                          >
                            {LINE_REASONS.map((o) => (
                              <option key={o.label} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                            <option value="__custom__">Other (custom)</option>
                          </select>
                          {reasonSelectValue === '__custom__' ? (
                            <input
                              className="mt-2 w-full rounded-full border border-border bg-background px-3 py-1.5 text-xs"
                              placeholder="Describe reason"
                              value={st.reason}
                              disabled={blocked}
                              aria-label={`Custom return reason for ${row.productName}`}
                              onChange={(e) => updateLine(lk, { reason: e.target.value })}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-3">
              Step 3 · Return type
            </span>
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
              <button
                type="button"
                disabled={blocked}
                onClick={() => setReturnType('FULL')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  returnType === 'FULL'
                    ? 'bg-primary-900 text-white dark:bg-primary-700 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Full
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => setReturnType('PARTIAL')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  returnType === 'PARTIAL'
                    ? 'bg-primary-900 text-white dark:bg-primary-700 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Partial
              </button>
            </div>
          </SectionCard>

          <SectionCard>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-3">
              Step 4 · Refund & notes
            </span>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Refund method"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}
                disabled={blocked}
                className="!rounded-full font-medium"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank (in review)</option>
                <option value="WALLET">Wallet (store credit)</option>
                <option value="ADJUSTMENT">Adjustment (pending / A/R)</option>
              </Select>
              {refundMethod === 'BANK' && (
                <Select
                  label="Bank account"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  disabled={blocked}
                  className="!rounded-full font-medium"
                >
                  <option value="">Select…</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.account_type})
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="mt-4">
              <Input label="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={blocked} />
            </div>
          </SectionCard>

          <section className="rounded-xl border border-primary-200 dark:border-primary-900 bg-primary-50/60 dark:bg-primary-950/25 shadow-[var(--shadow-card-val)] pl-1 border-l-4 border-l-primary-600 overflow-hidden">
            <div className="p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-900/80 dark:text-primary-200">
                  Step 5 · Summary
                </span>
                <p className="text-3xl font-bold tabular-nums text-primary-950 dark:text-primary-100 mt-1">
                  {CURRENCY} {formatMoney(totalReturn)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Estimated credit before posting.</p>
              </div>
              <Button
                type="button"
                disabled={blocked || loading}
                onClick={() => setConfirmOpen(true)}
                className="rounded-full gap-2 bg-primary-900 hover:bg-primary-950 dark:bg-primary-700 dark:hover:bg-primary-600 shadow-md px-8"
              >
                Review & submit
              </Button>
            </div>
          </section>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="bg-card dark:bg-slate-900 border border-border rounded-xl max-w-md w-full shadow-[var(--shadow-card-val)] overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="border-l-4 border-l-primary-600 pl-4">
                <h3 className="text-lg font-bold text-foreground">Confirm return</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Post return for <strong className="text-foreground">{CURRENCY} {formatMoney(totalReturn)}</strong> via{' '}
                  <strong className="text-foreground">{refundMethod}</strong>? Inventory and accounts will update.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-primary-900 hover:bg-primary-950 dark:bg-primary-700"
                  onClick={() => void submit()}
                  disabled={loading}
                >
                  {loading ? 'Submitting…' : 'Confirm'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
