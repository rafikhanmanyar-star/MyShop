/** Per-page SEO titles, descriptions, and canonical paths */
export const pageMeta = {
  home: {
    path: '/',
    title: 'oBo Store | Smart Grocery Store in B-17 Islamabad',
    description:
      'Order groceries, snacks, drinks, dairy, frozen items, and household essentials from oBo Store in B-17 Islamabad. Install our smart PWA for fast delivery, real-time tracking, secure ordering, and smart shopping utilities.',
    ogDescription:
      'Fast grocery delivery and smart shopping in B-17 Islamabad. Order snacks, dairy, frozen items, and household essentials with real-time tracking.',
  },
  features: {
    path: '/features',
    title: 'Grocery App Features | oBo Store B-17 Islamabad',
    description:
      'Explore oBo Store features: fast grocery delivery in B-17 Islamabad, real-time tracking, smart offers, secure ordering, easy returns, and low prices from FMC Kohsar Plaza.',
  },
  utilities: {
    path: '/utilities',
    title: 'Smart Grocery Utilities | oBo Store Islamabad',
    description:
      'Plan smarter with oBo Store utilities: budget planner, weekly menu planner, grocery reminders, smart recipes, family shared cart, and shopping planning for B-17 Islamabad.',
  },
  about: {
    path: '/about',
    title: 'About oBo Store | Grocery Store in B-17 Islamabad',
    description:
      'Learn about oBo Store — a trusted grocery store at FMC B-17 Kohsar Plaza Main Boulevard, Islamabad. Fast delivery, fair prices, and smart shopping tools for local families.',
  },
  contact: {
    path: '/contact',
    title: 'Contact oBo Store | FMC B-17 Kohsar Plaza Islamabad',
    description:
      'Contact oBo Store for grocery orders and support at FMC B-17 Kohsar Plaza Main Boulevard, Islamabad. Call, email, or visit our store in B-17.',
  },
  privacyPolicy: {
    path: '/privacy-policy',
    title: 'Privacy Policy | oBo Store',
    description:
      'Read how oBo Store collects, uses, and protects your personal data, order information, and privacy when you shop online or in store.',
  },
  terms: {
    path: '/terms-and-conditions',
    title: 'Terms and Conditions | oBo Store',
    description:
      'Terms and conditions for using the oBo Store website, smart grocery PWA, delivery service, and in-store shopping at FMC B-17 Kohsar Plaza.',
  },
  returnPolicy: {
    path: '/return-policy',
    title: 'Return Policy | oBo Store',
    description:
      'oBo Store return policy for eligible grocery, dairy, frozen, and household products. Learn how to request returns in B-17 Islamabad.',
  },
} as const;

export type PageKey = keyof typeof pageMeta;

/** Public URLs included in sitemap.xml */
export const sitemapPaths = [
  '/',
  '/features',
  '/utilities',
  '/about',
  '/contact',
  '/privacy-policy',
  '/terms-and-conditions',
  '/return-policy',
] as const;
