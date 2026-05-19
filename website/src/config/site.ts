const shopSlug = (import.meta.env.VITE_SHOP_SLUG || 'obo').trim().toLowerCase();
const shopAppBase = (import.meta.env.VITE_SHOP_APP_URL || 'https://shop.obostores.com').replace(/\/$/, '');

export const siteConfig = {
  brandName: 'oBo stores',
  tagline: 'Your neighborhood store, online.',
  shopSlug,
  shopOrderUrl: `${shopAppBase}/${shopSlug}`,
  shopProductsUrl: `${shopAppBase}/${shopSlug}/products`,
  shopOffersUrl: `${shopAppBase}/${shopSlug}/offers`,
  riderAppUrl: (import.meta.env.VITE_RIDER_APP_URL || 'https://rider.obostores.com').replace(/\/$/, ''),
  posAppUrl: (import.meta.env.VITE_POS_APP_URL || 'https://pos.obostores.com').replace(/\/$/, ''),
} as const;
