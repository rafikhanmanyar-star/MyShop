import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CURRENCY } from '../../constants';

export type MobileAccountingAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
};

export type MobileAccountingBankRow = {
  id: string;
  name: string;
  code: string;
  balance: number;
};

export type MobileAccountingSummary = {
  totalRevenue: number;
  grossProfit: number;
  netMargin: number;
  netProfit: number;
  receivablesTotal: number;
  customerAdvances: number;
  inventoryValuation: number;
  totalAssets: number;
};

type Props = {
  summary: MobileAccountingSummary;
  accounts: MobileAccountingAccount[];
  bankAccounts: MobileAccountingBankRow[];
  loading?: boolean;
};

const DASH_COA = {
  TRADE_RECEIVABLES: '11201',
  LEGACY_AR: 'AST-120',
  MERCHANDISE_LEGACY: 'AST-110',
  TRADE_PAYABLES: '21101',
  LEGACY_AP: 'LIA-200',
} as const;

function sumAccountBalance(accounts: MobileAccountingAccount[], predicate: (a: MobileAccountingAccount) => boolean): number {
  return accounts.reduce((s, a) => (predicate(a) ? s + (Number(a.balance) || 0) : s), 0);
}

function tradeReceivablesBalance(accounts: MobileAccountingAccount[], receivablesKpi: number): number {
  const explicit = accounts.find((a) => a.code === DASH_COA.TRADE_RECEIVABLES || a.code === DASH_COA.LEGACY_AR);
  if (explicit) return Number(explicit.balance) || 0;
  const byName = accounts.find((a) => a.type === 'Asset' && /^trade\s+receivable/i.test(String(a.name || '')));
  if (byName) return Number(byName.balance) || 0;
  return receivablesKpi;
}

function inventoryAssetBalance(accounts: MobileAccountingAccount[]): number {
  return sumAccountBalance(accounts, (a) => {
    if (a.type !== 'Asset') return false;
    const c = String(a.code || '');
    if (/^113\d{2}$/.test(c)) return true;
    return c === DASH_COA.MERCHANDISE_LEGACY;
  });
}

function prepaidExpensesBalance(accounts: MobileAccountingAccount[]): number {
  return sumAccountBalance(accounts, (a) => a.type === 'Asset' && /^114\d{2}$/.test(String(a.code || '')));
}

function tradePayablesBalance(accounts: MobileAccountingAccount[]): number {
  const explicit = accounts.find((a) => a.code === DASH_COA.TRADE_PAYABLES || a.code === DASH_COA.LEGACY_AP);
  if (explicit) return Number(explicit.balance) || 0;
  const byName = accounts.find(
    (a) =>
      a.type === 'Liability' &&
      /trade\s+payable/i.test(String(a.name || '')) &&
      !/(utility|salary|tax|accrued|loan|lease)/i.test(String(a.name || ''))
  );
  return byName ? Number(byName.balance) || 0 : 0;
}

function fmtMoney(n: number) {
  return `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MobileAccountingPanel({ summary, accounts, bankAccounts, loading }: Props) {
  const ledgerRows = useMemo(() => {
    const advances = Math.max(0, Number(summary.customerAdvances) || 0);
    const arBal = tradeReceivablesBalance(accounts, summary.receivablesTotal) + advances;
    const prepaidBal = prepaidExpensesBalance(accounts);
    const invBal =
      (Number(summary.inventoryValuation) || 0) > 0
        ? Number(summary.inventoryValuation)
        : inventoryAssetBalance(accounts);
    const apRaw = tradePayablesBalance(accounts);
    const listedAssetsSum = arBal + prepaidBal + invBal;
    const otherAssets = summary.totalAssets - listedAssetsSum;

    const rows: { name: string; balance: number }[] = [
      { name: 'Accounts Receivable', balance: arBal },
      { name: 'Prepaid Expenses', balance: prepaidBal },
      { name: 'Inventory Asset', balance: invBal },
    ];
    if (Math.abs(otherAssets) > 0.005) {
      rows.push({ name: 'Other assets (cash, bank, fixed, etc.)', balance: otherAssets });
    }
    rows.push({ name: 'Accounts Payable', balance: apRaw > 0 ? -Math.abs(apRaw) : apRaw });
    if (advances > 0.005) {
      rows.push({ name: 'Customer Advances (Khata credit)', balance: -advances });
    }
    return rows;
  }, [accounts, summary]);

  const bankTotal = useMemo(
    () => bankAccounts.reduce((s, r) => s + (Number(r.balance) || 0), 0),
    [bankAccounts]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-48 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-card">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
          Cash &amp; bank balances
        </h3>
        {bankAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-[#6C757D] dark:text-muted-foreground">
            No cash or bank accounts configured.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold tabular-nums text-[#212529] dark:text-foreground">
              Total {fmtMoney(bankTotal)}
            </p>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {bankAccounts.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#212529] dark:text-foreground">{row.name}</p>
                    <p className="text-[11px] text-[#6C757D] dark:text-muted-foreground">{row.code || '—'}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-[#212529] dark:text-foreground">
                    {fmtMoney(row.balance)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-card">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
          Ledger account balances
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-[#6C757D] dark:border-gray-700 dark:text-muted-foreground">
                <th className="pb-2 pr-2">Account</th>
                <th className="pb-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.name} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-2 text-[11px] font-semibold text-[#212529] dark:text-foreground">
                    {row.name}
                  </td>
                  <td
                    className={`py-2 text-right text-[11px] font-bold tabular-nums ${
                      row.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#212529] dark:text-foreground'
                    }`}
                  >
                    {row.balance < 0
                      ? `(${CURRENCY} ${Math.abs(row.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                      : fmtMoney(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 text-[11px] font-bold text-[#212529] dark:text-foreground">
                  Total assets (full ledger)
                </td>
                <td className="pt-3 text-right text-[11px] font-bold tabular-nums text-[#212529] dark:text-foreground">
                  {fmtMoney(summary.totalAssets)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <Link
        to="/accounting"
        className="block rounded-xl border border-[#4A90E2]/30 bg-[#4A90E2]/5 py-3 text-center text-xs font-bold uppercase tracking-wider text-[#4A90E2] transition active:scale-[0.98] dark:text-[#9bc5f0]"
      >
        Open full accounting
      </Link>
    </div>
  );
}
