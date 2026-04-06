import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

type LineState = Record<
  string,
  { qty: string; restock: boolean; reason: string }
>;

function lineKey(row: { saleLineItemId?: string; mobileOrderLineItemId?: string }) {
  return String(row.saleLineItemId || row.mobileOrderLineItemId || '');
}

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
}

export default function SalesReturnCreatePage() {
  const navigate = useNavigate();
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

  const loadEligibility = async () => {
    const inv = invoiceInput.trim();
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
        };
      }
      setLineState(next);
    } catch (e: any) {
      setEligibility(null);
      setError(e?.error || e?.message || 'Failed to load sale');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadBanks();
  }, [loadBanks]);

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
      if (isMobile) {
        items.push({
          mobileOrderLineItemId: row.mobileOrderLineItemId,
          quantity: q,
          restock: st?.restock !== false,
          reason: st?.reason || undefined,
        });
      } else {
        items.push({
          saleLineItemId: row.saleLineItemId,
          quantity: q,
          restock: st?.restock !== false,
          reason: st?.reason || undefined,
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
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <div className="flex items-center gap-4">
        <Link to="/sales-returns" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New sales return</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter a POS invoice number or a mobile app order number (delivered and paid), then lines and refund method.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-800 dark:text-rose-200 flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border dark:border-slate-700 p-6 space-y-4 bg-card dark:bg-slate-900/60">
        <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">1. Original sale</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="POS invoice or mobile order #"
              value={invoiceInput}
              onChange={(e) => setInvoiceInput(e.target.value)}
              placeholder="e.g. INV-00042 or MO-1024"
            />
          </div>
          <Button onClick={() => void loadEligibility()} disabled={loading}>
            Load sale
          </Button>
        </div>
        {eligibility?.sale && (
          <p className="text-sm text-muted-foreground">
            {(returnSource === 'mobile' || eligibility.source === 'mobile') && (
              <span className="mr-2 rounded-md bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:text-indigo-200">
                Mobile order
              </span>
            )}
            {(returnSource === 'pos' || eligibility.source === 'pos') && (
              <span className="mr-2 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium">POS</span>
            )}
            Order total {CURRENCY} {formatMoney(parseFloat(eligibility.sale.grandTotal) || 0)} · Status{' '}
            <span className="font-semibold text-foreground">{eligibility.sale.status}</span>
            {(eligibility.sale as any).paymentStatus != null && (
              <>
                {' '}
                · Payment{' '}
                <span className="font-semibold text-foreground">{(eligibility.sale as any).paymentStatus}</span>
              </>
            )}
          </p>
        )}
      </section>

      {eligibility && (
        <>
          {blocked && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm">
              {eligibility.blockReason || 'Returns are not allowed for this sale.'}
            </div>
          )}

          <section className="rounded-2xl border border-border dark:border-slate-700 p-6 space-y-4 bg-card dark:bg-slate-900/60">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">2. Lines</h2>
              <Button type="button" variant="secondary" size="sm" onClick={applyFullQuantities} disabled={blocked}>
                Fill full return
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 pr-2">Sold</th>
                    <th className="py-2 pr-2 text-rose-600 dark:text-rose-400">Already returned</th>
                    <th className="py-2 pr-2">Available</th>
                    <th className="py-2 pr-2">Return qty</th>
                    <th className="py-2 pr-2">Restock</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibility.items.map((row: any) => {
                    const lk = lineKey(row);
                    const st = lineState[lk] || { qty: '0', restock: true, reason: '' };
                    const avail = Number(row.availableToReturn) || 0;
                    const ret = Number(row.alreadyReturned) || 0;
                    return (
                      <tr key={lk} className="border-b border-border/60">
                        <td className="py-2 pr-2 font-medium">{row.productName}</td>
                        <td className="py-2 pr-2 font-mono">{row.soldQty}</td>
                        <td className="py-2 pr-2 font-mono text-rose-600 dark:text-rose-400">{ret}</td>
                        <td className="py-2 pr-2 font-mono text-emerald-600 dark:text-emerald-400">{avail}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            max={avail}
                            disabled={blocked}
                            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
                            value={st.qty}
                            onChange={(e) => updateLine(lk, { qty: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={st.restock}
                            disabled={blocked}
                            onChange={(e) => updateLine(lk, { restock: e.target.checked })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="w-full min-w-[120px] rounded-md border border-input bg-background px-2 py-1 text-sm"
                            placeholder="Optional"
                            value={st.reason}
                            disabled={blocked}
                            onChange={(e) => updateLine(lk, { reason: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border dark:border-slate-700 p-6 space-y-4 bg-card dark:bg-slate-900/60">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">3. Return type</h2>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rt"
                  checked={returnType === 'FULL'}
                  onChange={() => setReturnType('FULL')}
                  disabled={blocked}
                />
                Full
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rt"
                  checked={returnType === 'PARTIAL'}
                  onChange={() => setReturnType('PARTIAL')}
                  disabled={blocked}
                />
                Partial
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-border dark:border-slate-700 p-6 space-y-4 bg-card dark:bg-slate-900/60">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">4. Refund method</h2>
            <Select
              label="Method"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
              disabled={blocked}
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="WALLET">Wallet (store credit)</option>
              <option value="ADJUSTMENT">Adjustment (A/R)</option>
            </Select>
            {refundMethod === 'BANK' && (
              <Select label="Bank account" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} disabled={blocked}>
                <option value="">Select…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.account_type})
                  </option>
                ))}
              </Select>
            )}
            <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={blocked} />
          </section>

          <section className="rounded-2xl border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20 p-6 space-y-2">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">5. Summary</h2>
            <p className="text-2xl font-semibold font-mono">
              {CURRENCY} {formatMoney(totalReturn)}
            </p>
            <Button disabled={blocked || loading} onClick={() => setConfirmOpen(true)}>
              Review & submit
            </Button>
          </section>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card dark:bg-slate-900 border border-border rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold">Confirm return</h3>
            <p className="text-sm text-muted-foreground">
              Post return for <strong>{CURRENCY} {formatMoney(totalReturn)}</strong> via <strong>{refundMethod}</strong>?
              Inventory and accounts will update.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={loading}>
                {loading ? 'Submitting…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
