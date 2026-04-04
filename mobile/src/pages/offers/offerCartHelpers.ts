import type { OfferCartItem } from '../../context/AppContext';
import {
  computeBundleBasePrice,
  computeOfferBundlePricing,
  taxPerBundleAfterDiscount,
  type OfferType,
} from '../../utils/offerPricing';

export type OfferDetailResponse = {
  id: string;
  title: string;
  offer_type: string;
  discount_type?: string | null;
  discount_value?: number | null;
  fixed_price?: number | null;
  items: Array<{
    product_id: string;
    quantity: number | string;
    unit_price: number;
    tax_rate: number;
    name?: string;
    image_url?: string | null;
  }>;
};

export function buildOfferCartItem(offer: OfferDetailResponse, quantity: number): OfferCartItem {
  const lines = offer.items.map(i => ({
    unitPrice: Number(i.unit_price) || 0,
    quantity: Number(i.quantity) || 0,
    taxRate: Number(i.tax_rate) || 0,
  }));
  const base = computeBundleBasePrice(lines.map(l => ({ unitPrice: l.unitPrice, quantity: l.quantity })));
  const ot = offer.offer_type as OfferType;
  const { finalSubtotal, discountFromBase } = computeOfferBundlePricing(
    ot,
    offer.discount_type as 'percentage' | 'fixed' | null,
    offer.discount_value != null ? Number(offer.discount_value) : null,
    offer.fixed_price != null ? Number(offer.fixed_price) : null,
    base
  );
  const tax = taxPerBundleAfterDiscount(
    offer.items.map(i => ({
      unitPrice: Number(i.unit_price) || 0,
      quantity: Number(i.quantity) || 0,
      taxRate: Number(i.tax_rate) || 0,
    })),
    discountFromBase
  );

  let discountBadge = 'DEAL';
  if (ot === 'discount') {
    if (offer.discount_type === 'percentage' && offer.discount_value != null) {
      discountBadge = `${Number(offer.discount_value)}% OFF`;
    } else if (offer.discount_type === 'fixed' && offer.discount_value != null) {
      discountBadge = `Rs. ${Number(offer.discount_value)} OFF`;
    }
  } else {
    discountBadge = 'BUNDLE';
  }

  return {
    offerId: offer.id,
    title: offer.title,
    quantity,
    merchandisePerBundle: finalSubtotal,
    taxPerBundle: tax,
    productIds: offer.items.map(i => i.product_id),
    discountBadge,
  };
}
