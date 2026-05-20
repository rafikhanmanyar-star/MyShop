/** Per-page SEO titles, descriptions, and canonical paths */
export const pageMeta = {
  home: {
    path: '/',
    title: 'oBo Store | Smart Grocery Store in B-17 Islamabad',
    description:
      'Install oBo Store PWA to order groceries, snacks, drinks, dairy, frozen items, and household essentials from FMC B-17 Kohsar Plaza Main Boulevard with fast delivery and real-time tracking.',
  },
  features: {
    path: '/features',
    title: 'Features | oBo Store Grocery PWA Islamabad',
    description:
      'Explore oBo Store features including fast delivery, real-time tracking, smart offers, easy returns, secure ordering, and low prices in B-17 Islamabad.',
  },
  utilities: {
    path: '/utilities',
    title: 'Smart Grocery Utilities | oBo Store',
    description:
      'Plan smarter with oBo Store utilities including budget planner, weekly menu planner, grocery reminders, smart recipes, family shared cart, and shopping planning.',
  },
  about: {
    path: '/about',
    title: 'About oBo Store | Trusted Grocery Store in B-17 Islamabad',
    description:
      'oBo Store is a trusted grocery and household essentials store at FMC B-17 Kohsar Plaza Main Boulevard, serving customers with fast delivery, low prices, and smart shopping tools.',
  },
  contact: {
    path: '/contact',
    title: 'Contact oBo Store | FMC B-17 Kohsar Plaza Islamabad',
    description:
      'Contact oBo Store for groceries, snacks, drinks, dairy, frozen items, and household essentials at FMC B-17 Kohsar Plaza Main Boulevard, Islamabad.',
  },
  privacyPolicy: {
    path: '/privacy-policy',
    title: 'Privacy Policy | oBo Store',
    description:
      'Learn how oBo Store protects your data, privacy, and shopping information.',
  },
  terms: {
    path: '/terms-and-conditions',
    title: 'Terms and Conditions | oBo Store',
    description:
      'Read the terms and conditions for using the oBo Store website and PWA.',
  },
  returnPolicy: {
    path: '/return-policy',
    title: 'Return Policy | oBo Store',
    description:
      'Read the oBo Store return policy for eligible grocery, household, dairy, and frozen products.',
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
