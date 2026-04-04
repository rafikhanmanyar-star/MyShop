/** Mirrors server/services/offerPricing.ts for cart display (server validates on checkout). */

export type OfferType = 'discount' | 'bundle' | 'fixed_price';
export type DiscountType = 'percentage' | 'fixed';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBundleBasePrice(lines: { unitPrice: number; quantity: number }[]): number {
  return roundMoney(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
}

export function computeOfferBundlePricing(
  offerType: OfferType,
  discountType: DiscountType | null | undefined,
  discountValue: number | null | undefined,
  fixedPrice: number | null | undefined,
  bundleBase: number
): { finalSubtotal: number; discountFromBase: number } {
  if (offerType === 'bundle' || offerType === 'fixed_price') {
    const fp = fixedPrice != null && Number.isFinite(Number(fixedPrice)) ? Number(fixedPrice) : 0;
    const finalSubtotal = roundMoney(fp);
    return { finalSubtotal, discountFromBase: roundMoney(Math.max(0, bundleBase - finalSubtotal)) };
  }
  let disc = 0;
  if (discountType === 'percentage' && discountValue != null) {
    const dv = Number(discountValue);
    if (Number.isFinite(dv)) disc = roundMoney(bundleBase * (dv / 100));
  } else if (discountType === 'fixed' && discountValue != null) {
    const dv = Number(discountValue);
    if (Number.isFinite(dv)) disc = roundMoney(Math.min(dv, bundleBase));
  }
  return {
    finalSubtotal: roundMoney(Math.max(0, bundleBase - disc)),
    discountFromBase: disc,
  };
}

export function allocateDiscountAcrossLines(
  lines: { unitPrice: number; quantity: number }[],
  totalDiscount: number
): number[] {
  const base = computeBundleBasePrice(lines);
  if (base <= 0 || lines.length === 0) return lines.map(() => 0);
  const raw = lines.map(l => {
    const lineBase = l.unitPrice * l.quantity;
    return (totalDiscount * lineBase) / base;
  });
  const rounded = raw.map(r => roundMoney(r));
  let sum = rounded.reduce((a, b) => a + b, 0);
  const diff = roundMoney(totalDiscount - sum);
  if (rounded.length > 0) {
    rounded[rounded.length - 1] = roundMoney(rounded[rounded.length - 1] + diff);
  }
  return rounded;
}

/** After discount, tax per bundle (matches server allocation). */
export function taxPerBundleAfterDiscount(
  lines: { unitPrice: number; quantity: number; taxRate: number }[],
  totalDiscount: number
): number {
  const alloc = allocateDiscountAcrossLines(
    lines.map(l => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    totalDiscount
  );
  let tax = 0;
  lines.forEach((l, i) => {
    const gross = l.unitPrice * l.quantity;
    const disc = alloc[i] ?? 0;
    const taxable = roundMoney(gross - disc);
    tax += roundMoney(taxable * (l.taxRate / 100));
  });
  return roundMoney(tax);
}
