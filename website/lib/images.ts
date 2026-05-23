/** Optimized image assets — alt text must match visible content for SEO */
export const siteImages = {
  heroAppMockup: {
    src: '/images/hero-home.png',
    alt: 'oBo Store grocery delivery app with live order tracking for B-17 Islamabad',
    width: 685,
    height: 617,
  },
  heroPwaOrdering: {
    src: '/images/hero-home.png',
    alt: 'Smart grocery shopping app Pakistan — oBo Store PWA ordering screen',
    width: 685,
    height: 617,
  },
  trackingFeature: {
    src: '/images/tracking-feature.webp',
    alt: 'oBo Store real-time grocery delivery tracking in Islamabad',
    width: 280,
    height: 160,
  },
  storeFmcB17: {
    src: '/images/store-fmc-b17.webp',
    alt: 'Grocery store in B-17 Islamabad — oBo Store at FMC Kohsar Plaza',
    width: 640,
    height: 400,
  },
  householdDelivery: {
    src: '/images/household-delivery.webp',
    alt: 'Household essentials delivery from oBo Store in B-17 Islamabad',
    width: 640,
    height: 400,
  },
  budgetPlanner: {
    src: '/images/budget-planner.webp',
    alt: 'oBo Store smart grocery budget planner utility',
    width: 480,
    height: 320,
  },
  pwaInstall: {
    src: '/images/pwa-install.webp',
    alt: 'Install oBo Store grocery delivery app on your phone',
    width: 320,
    height: 280,
  },
  shopKohsarPlaza: {
    src: '/images/shop-kohsar-plaza.webp',
    alt: 'oBo Store physical shop at Kohsar Plaza Main Boulevard Islamabad',
    width: 640,
    height: 400,
  },
  scanToOrderQr: {
    src: '/images/scan-to-order-qr.png',
    alt: 'Scan QR code to order groceries online at oBo Store',
    width: 134,
    height: 123,
  },
} as const;

export type SiteImageKey = keyof typeof siteImages;
