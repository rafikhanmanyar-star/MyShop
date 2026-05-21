/** Optimized image assets — alt text must match visible content for SEO */
export const siteImages = {
  heroAppMockup: {
    src: '/images/hero-app-mockup-red.png',
    alt: 'oBo Store grocery app on mobile with live delivery tracking, categories, and best deals for FMC B-17 Kohsar Plaza',
    width: 909,
    height: 755,
  },
  heroPwaOrdering: {
    src: '/images/hero-app-mockup-red.png',
    alt: 'oBo Store PWA grocery ordering screen',
    width: 909,
    height: 755,
  },
  trackingFeature: {
    src: '/images/tracking-feature.webp',
    alt: 'oBo Store real-time order tracking feature',
    width: 280,
    height: 160,
  },
  storeFmcB17: {
    src: '/images/store-fmc-b17.webp',
    alt: 'Grocery store in FMC B-17 Islamabad',
    width: 640,
    height: 400,
  },
  householdDelivery: {
    src: '/images/household-delivery.webp',
    alt: 'Household essentials delivery in B-17 Islamabad',
    width: 640,
    height: 400,
  },
  budgetPlanner: {
    src: '/images/budget-planner.webp',
    alt: 'Smart grocery budget planner in oBo Store',
    width: 480,
    height: 320,
  },
  pwaInstall: {
    src: '/images/pwa-install.webp',
    alt: 'oBo Store PWA install screen',
    width: 320,
    height: 280,
  },
  shopKohsarPlaza: {
    src: '/images/shop-kohsar-plaza.webp',
    alt: 'oBo Store physical shop at Kohsar Plaza',
    width: 640,
    height: 400,
  },
  scanToOrderQr: {
    src: '/images/scan-to-order-qr.png',
    alt: 'QR code — scan to order groceries online at oBo Store',
    width: 134,
    height: 123,
  },
} as const;

export type SiteImageKey = keyof typeof siteImages;
