import {
  allocateDiscountAcrossLines,
  computeBundleBasePrice,
  computeOfferBundlePricing,
  roundMoney,
  type OfferType,
} from './offerPricing.js';
import { getOfferService } from './offerService.js';

export interface OfferBundleInput {
  offerId: string;
  quantity: number;
}

export interface PreparedOfferLine {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountAmount: number;
  /** Gross line (unit * qty) before discount */
  grossSubtotal: number;
  taxAmount: number;
  offerId: string;
}

interface BundleLineRow {
  unitPrice: number;
  quantity: number;
  productId: string;
  productName: string;
  productSku: string;
  taxRate: number;
}

function mergeOfferBundles(bundles: OfferBundleInput[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!bundles?.length) return m;
  for (const b of bundles) {
    const q = Math.max(0, Number(b.quantity) || 0);
    if (q <= 0) continue;
    m.set(b.offerId, (m.get(b.offerId) || 0) + q);
  }
  return m;
}

async function loadOfferForCheckout(client: any, tenantId: string, offerId: string) {
  const rows = await client.query(
    `SELECT o.* FROM offers o
     WHERE o.id = $1 AND o.tenant_id = $2
       AND o.is_active = TRUE
       AND o.start_date <= NOW()
       AND o.end_date >= NOW()`,
    [offerId, tenantId]
  );
  if (rows.length === 0) throw new Error(`Offer not available: ${offerId}`);
  const offer = rows[0];
  const items = await client.query(
    `SELECT oi.product_id, oi.quantity AS req_qty,
            p.name, p.sku, p.tax_rate,
            COALESCE(p.mobile_price, p.retail_price)::float8 AS unit_price
     FROM offer_items oi
     INNER JOIN shop_products p ON p.id = oi.product_id AND p.tenant_id = $2
     WHERE oi.offer_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE`,
    [offerId, tenantId]
  );
  if (items.length === 0) throw new Error(`Offer "${offer.title}" has no valid products`);
  return { offer, items };
}

async function expandOneOffer(
  client: any,
  tenantId: string,
  offerId: string,
  bundleQty: number
): Promise<{ lines: PreparedOfferLine[]; discountTotal: number }> {
  if (bundleQty <= 0) return { lines: [], discountTotal: 0 };
  const { offer, items } = await loadOfferForCheckout(client, tenantId, offerId);

  const perBundleLines: BundleLineRow[] = items.map((r: any) => ({
    unitPrice: Number(r.unit_price) || 0,
    quantity: Number(r.req_qty) * 1,
    productId: r.product_id,
    productName: r.name,
    productSku: r.sku,
    taxRate: parseFloat(r.tax_rate) || 0,
  }));

  const baseOneBundle = computeBundleBasePrice(
    perBundleLines.map((l: BundleLineRow) => ({ unitPrice: l.unitPrice, quantity: l.quantity }))
  );
  if (baseOneBundle <= 0) throw new Error(`Offer "${offer.title}" has invalid pricing`);

  const offerType = offer.offer_type as OfferType;
  const { discountFromBase: discOneBundle } = computeOfferBundlePricing(
    offerType,
    offer.discount_type,
    offer.discount_value != null ? Number(offer.discount_value) : null,
    offer.fixed_price != null ? Number(offer.fixed_price) : null,
    baseOneBundle
  );

  const totalDiscount = roundMoney(discOneBundle * bundleQty);

  const scaledLines = perBundleLines.map((l: BundleLineRow) => ({
    ...l,
    quantity: l.quantity * bundleQty,
  }));

  const allocDiscounts = allocateDiscountAcrossLines(
    scaledLines.map((l: BundleLineRow) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    totalDiscount
  );

  const lines: PreparedOfferLine[] = scaledLines.map((l: BundleLineRow, i: number) => {
    const gross = roundMoney(l.unitPrice * l.quantity);
    const disc = allocDiscounts[i] ?? 0;
    const taxable = roundMoney(gross - disc);
    const taxAmount = roundMoney(taxable * (l.taxRate / 100));
    return {
      productId: l.productId,
      productName: l.productName,
      productSku: l.productSku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      discountAmount: disc,
      grossSubtotal: gross,
      taxAmount,
      offerId,
    };
  });

  return { lines, discountTotal: totalDiscount };
}

/** Different offers cannot claim the same product in stack mode. */
function assertNoProductOverlapAcrossOffers(
  offerProductSets: Map<string, Set<string>>
) {
  const seen = new Set<string>();
  for (const [, pids] of offerProductSets) {
    for (const pid of pids) {
      if (seen.has(pid)) {
        throw new Error('These promotions cannot be combined (overlapping products). Remove one offer or change stacking in Settings.');
      }
      seen.add(pid);
    }
  }
}

async function assertUsageLimits(
  client: any,
  tenantId: string,
  customerId: string | undefined,
  offerId: string,
  bundleQty: number,
  maxPerUser: number | null
) {
  if (maxPerUser == null || !customerId) return;
  const rows = await client.query(
    `SELECT usage_count FROM mobile_customer_offer_usage
     WHERE tenant_id = $1 AND customer_id = $2 AND offer_id = $3`,
    [tenantId, customerId, offerId]
  );
  const used = rows[0] ? Number(rows[0].usage_count) || 0 : 0;
  if (used + bundleQty > maxPerUser) {
    throw new Error('This promotion has a per-customer usage limit. Reduce quantity or remove the offer.');
  }
}

/**
 * Resolves offer bundles into flat product lines with discounts. Enforces stacking rules.
 */
export async function prepareOfferBundlesForOrder(
  client: any,
  tenantId: string,
  customerId: string | undefined,
  offerBundles: OfferBundleInput[] | undefined
): Promise<{
  merged: Map<string, number>;
  flatLines: PreparedOfferLine[];
  offerDiscountSum: number;
}> {
  let merged = mergeOfferBundles(offerBundles);
  if (merged.size === 0) {
    return { merged, flatLines: [], offerDiscountSum: 0 };
  }

  const stackingMode = await getOfferService().getOfferStackingMode(tenantId);

  if (stackingMode === 'best') {
    let bestId: string | null = null;
    let bestSaving = -1;
    for (const [offerId, qty] of merged) {
      const { offer, items } = await loadOfferForCheckout(client, tenantId, offerId);
      const baseOne = computeBundleBasePrice(
        items.map((r: any) => ({
          unitPrice: Number(r.unit_price) || 0,
          quantity: Number(r.req_qty) || 0,
        }))
      );
      const { discountFromBase } = computeOfferBundlePricing(
        offer.offer_type as OfferType,
        offer.discount_type,
        offer.discount_value != null ? Number(offer.discount_value) : null,
        offer.fixed_price != null ? Number(offer.fixed_price) : null,
        baseOne
      );
      const saving = discountFromBase * qty;
      if (saving > bestSaving) {
        bestSaving = saving;
        bestId = offerId;
      }
    }
    if (bestId == null) throw new Error('No valid offers');
    const q = merged.get(bestId) || 0;
    merged = new Map([[bestId, q]]);
  }

  const offerProductSets = new Map<string, Set<string>>();
  for (const offerId of merged.keys()) {
    const { items } = await loadOfferForCheckout(client, tenantId, offerId);
    offerProductSets.set(
      offerId,
      new Set(items.map((r: any) => r.product_id as string))
    );
  }
  if (stackingMode === 'stack') {
    assertNoProductOverlapAcrossOffers(offerProductSets);
  }

  const flatLines: PreparedOfferLine[] = [];
  let offerDiscountSum = 0;

  for (const [offerId, bundleQty] of merged) {
    const { offer } = await loadOfferForCheckout(client, tenantId, offerId);
    await assertUsageLimits(client, tenantId, customerId, offerId, bundleQty, offer.max_usage_per_user != null ? Number(offer.max_usage_per_user) : null);
    const { lines, discountTotal } = await expandOneOffer(client, tenantId, offerId, bundleQty);
    flatLines.push(...lines);
    offerDiscountSum += discountTotal;
  }

  return { merged, flatLines, offerDiscountSum: roundMoney(offerDiscountSum) };
}

/** Merge quantities for same product from offer lines (for inventory check). */
export function aggregateQuantitiesFromOfferLines(lines: PreparedOfferLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) || 0) + l.quantity);
  }
  return m;
}

export { mergeOfferBundles };
