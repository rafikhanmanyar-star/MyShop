import { POSPaymentMethod } from '../types/pos';

/** Chart-of-accounts entries that can fund supplier payments, expenses, POS receipts, etc. */

export type PayFromAccountOption = {
  id: string;
  name: string;
  code?: string;
};

type RawAccount = {
  id: string;
  name: string;
  code?: string;
  type?: string;
  level?: number | null;
  is_active?: boolean;
  isActive?: boolean;
  parent_account_id?: string | null;
  parentAccountId?: string | null;
};

const LEGACY_CASH_BANK_CODES = new Set(['AST-100', 'AST-101', 'AST-102']);

/** Non-liquid asset prefixes — inventory, receivables, fixed assets, etc. */
const NON_LIQUID_ASSET_PREFIXES = ['112', '113', '114', '121', '122'];

export function isCashOrBankAssetCode(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  if (LEGACY_CASH_BANK_CODES.has(c)) return true;
  return c.startsWith('111') && c.length >= 5;
}

export function isNonLiquidAssetCode(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  return NON_LIQUID_ASSET_PREFIXES.some((p) => c.startsWith(p));
}

/**
 * Leaf Asset accounts suitable as payment sources: standard cash/bank (111xx),
 * legacy AST codes, accounts linked to shop bank rows, and custom user-created Asset accounts.
 */
export function filterPayFromChartAccounts(
  accounts: RawAccount[],
  linkedChartIds?: Iterable<string>
): PayFromAccountOption[] {
  const linked = linkedChartIds ? new Set(linkedChartIds) : new Set<string>();
  const childCount = new Map<string, number>();
  for (const a of accounts) {
    const pid = a.parent_account_id ?? a.parentAccountId;
    if (pid) childCount.set(pid, (childCount.get(pid) || 0) + 1);
  }

  return accounts
    .filter((a) => {
      if (a.type !== 'Asset') return false;
      const active = a.is_active ?? a.isActive;
      if (active === false) return false;
      const hasChildren = (childCount.get(a.id) || 0) > 0;
      if (hasChildren) return false;
      const level = a.level != null ? Number(a.level) : null;
      if (level != null && level < 4) return false;
      if (linked.has(a.id)) return true;
      const code = String(a.code || '').trim();
      if (isNonLiquidAssetCode(code)) return false;
      if (isCashOrBankAssetCode(code)) return true;
      return true;
    })
    .map((a) => ({ id: a.id, name: a.name, code: a.code }))
    .sort(
      (a, b) =>
        (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name)
    );
}

export function formatPayFromAccountLabel(acc: PayFromAccountOption): string {
  return acc.code ? `${acc.name} (${acc.code})` : acc.name;
}

/** Prefer Cash on Hand, then first available pay-from account. */
export function pickDefaultPayFromAccountId(accounts: PayFromAccountOption[]): string {
  if (accounts.length === 0) return '';
  const cash =
    accounts.find((a) => a.code === '11101') ??
    accounts.find((a) => a.code === 'AST-100') ??
    accounts.find((a) => /cash/i.test(a.name));
  return String((cash ?? accounts[0]).id);
}

/** Maps chart account code to supplier payment_method for storage and reports. */
export function paymentMethodForPayFromAccount(code?: string): 'Cash' | 'Bank' {
  const c = String(code || '').trim();
  if (c === '11101' || c === '11104' || c === '11105' || c === 'AST-100') return 'Cash';
  if (isCashOrBankAssetCode(c)) return 'Bank';
  if (/cash/i.test(c)) return 'Cash';
  return 'Bank';
}

/** Cash-style accounts for POS (vs online/bank). */
export function isPosCashStylePayFromAccount(acc: PayFromAccountOption): boolean {
  return paymentMethodForPayFromAccount(acc.code) === 'Cash' || /cash/i.test(acc.name);
}

/** POS payment methods that post to a chart-of-accounts receive account. */
export function payFromAccountsForPosMethod(
  accounts: PayFromAccountOption[],
  method: POSPaymentMethod
): PayFromAccountOption[] {
  if (method === POSPaymentMethod.KHATA) return [];
  const cashStyle = method === POSPaymentMethod.CASH;
  const filtered = accounts.filter((a) =>
    cashStyle ? isPosCashStylePayFromAccount(a) : !isPosCashStylePayFromAccount(a)
  );
  return filtered.length > 0 ? filtered : accounts;
}

/**
 * Resolve which chart account receives a POS payment.
 * Uses the selected id when valid; otherwise the default for the payment method.
 */
export function resolvePayFromAccountForPos(
  accounts: PayFromAccountOption[],
  method: POSPaymentMethod,
  selectedId?: string
): PayFromAccountOption | undefined {
  if (method === POSPaymentMethod.KHATA) return undefined;
  const list = payFromAccountsForPosMethod(accounts, method);
  if (list.length === 0) return undefined;
  if (selectedId) {
    const selected = list.find((a) => a.id === selectedId) ?? accounts.find((a) => a.id === selectedId);
    if (selected) return selected;
  }
  const defaultId = pickDefaultPayFromAccountId(list);
  return list.find((a) => a.id === defaultId) ?? list[0];
}
