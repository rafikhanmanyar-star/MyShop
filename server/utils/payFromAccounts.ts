/**
 * Leaf Asset accounts that can fund payments (supplier, POS receipts, etc.).
 * Includes standard cash/bank (111xx), legacy AST codes, bank-linked accounts,
 * and user-created custom Asset accounts — excludes inventory, receivables, fixed assets.
 */

const LEGACY_CASH_BANK_CODES = new Set(['AST-100', 'AST-101', 'AST-102']);

/** Non-liquid asset prefixes (IFRS-style 5-digit CoA) — not valid pay-from sources */
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

export type PayFromAccountRow = {
  id: string;
  type?: string;
  level?: number | null;
  code?: string;
  is_active?: boolean;
  parent_account_id?: string | null;
};

/**
 * True when a chart account may be used as cash/bank for payments (server-side validation).
 */
export function isPayFromEligibleAssetAccount(
  acc: PayFromAccountRow,
  opts?: { hasChildren?: boolean; linkedToBank?: boolean }
): boolean {
  if (acc.type !== 'Asset') return false;
  if (acc.is_active === false) return false;
  if (opts?.hasChildren) return false;
  const level = acc.level != null ? Number(acc.level) : null;
  if (level != null && level < 4) return false;
  if (opts?.linkedToBank) return true;

  const code = String(acc.code || '').trim();
  if (isNonLiquidAssetCode(code)) return false;
  if (isCashOrBankAssetCode(code)) return true;
  // Custom user-created leaf Asset accounts (e.g. HBL, custom Cash)
  return true;
}

export function paymentMethodForPayFromAccount(code?: string): 'Cash' | 'Bank' {
  const c = String(code || '').trim();
  if (c === '11101' || c === '11104' || c === '11105' || c === 'AST-100') return 'Cash';
  if (isCashOrBankAssetCode(c)) return 'Bank';
  if (/cash/i.test(c)) return 'Cash';
  return 'Bank';
}
