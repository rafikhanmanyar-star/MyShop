/** Chart-of-accounts entries that can fund supplier payments, expenses, etc. */

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

function isCashOrBankAssetCode(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  if (LEGACY_CASH_BANK_CODES.has(c)) return true;
  return c.startsWith('111') && c.length >= 5;
}

/**
 * Leaf Asset accounts suitable as payment sources: cash & bank equivalents (111xx),
 * legacy AST cash/bank codes, and any account linked to an active shop bank account.
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
      if ((childCount.get(a.id) || 0) > 0) return false;
      const level = a.level != null ? Number(a.level) : null;
      if (level != null && level < 4) return false;
      if (linked.has(a.id)) return true;
      return isCashOrBankAssetCode(String(a.code || ''));
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
  if (c.startsWith('111') || LEGACY_CASH_BANK_CODES.has(c)) return 'Bank';
  return 'Bank';
}
