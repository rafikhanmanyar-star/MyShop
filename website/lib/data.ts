export const siteConfig = {
  name: 'oBo Store',
  shortName: 'oBo',
  brand: 'oBo store',
  title: 'oBo Store | Smart Grocery Store in B-17 Islamabad',
  description:
    'Install oBo Store PWA to order groceries, snacks, drinks, dairy, frozen items, and household essentials from FMC B-17 Kohsar Plaza Main Boulevard with fast delivery and real-time tracking.',
  pwaDescription:
    'Install the oBo smart grocery app to order from our FMC B-17 store with real-time tracking, budget tools, and fast delivery across B-17 Islamabad.',
  url: 'https://obostore.com',
  /** Live grocery PWA / shop (Install CTA destination) */
  shopUrl: 'https://obostores-shop.pages.dev/',
  logo: '/logo.png',
  schemaAddress: 'FMC B-17 Kohsar Plaza Main Boulevard, Islamabad, Pakistan',
  schemaAreaServed: ['B-17 Islamabad', 'FMC B-17', 'Kohsar Plaza'] as const,
  openingHours: '09:00-23:00',
  priceRange: 'PKR',
  address: 'FMC B-17 Kohsar Plaza, Main Boulevard',
  addressLine2: 'Sector B-17, Islamabad',
  city: 'Islamabad',
  region: 'Islamabad Capital Territory',
  postalCode: '44000',
  countryCode: 'PK',
  phone: '+92 300 1234567',
  phoneE164: '+923001234567',
  email: 'support@obostore.com',
  promoCode: 'OBOFIRST',
  themeColor: '#DC2626',
  backgroundColor: '#FFFFFF',
  hours: 'Open Daily 9:00 AM – 11:00 PM',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=FMC+B-17+Kohsar+Plaza%2C+Main+Boulevard%2C+Sector+B-17%2C+Islamabad',
  geo: {
    latitude: 33.681,
    longitude: 72.819,
  },
  areaServed: [
    'FMC B-17',
    'Multi Gardens B-17',
    'Gulberg Greens',
    'MPCHS B-17',
    'Sector B-17 Islamabad',
    'Main Boulevard B-17',
  ],
  sameAs: [] as string[],
} as const;

export const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Utilities', href: '/utilities' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

export const trustFeatures = [
  { title: 'Fast Delivery', subtitle: 'Across B-17 Islamabad' },
  { title: 'Real-time Tracking', subtitle: 'Track your order live' },
  { title: 'Low Prices', subtitle: 'Best value every day' },
  { title: 'Return Available', subtitle: 'Easy returns policy' },
  { title: 'Trusted Local Store', subtitle: 'FMC B-17 Kohsar Plaza' },
  { title: 'Secure Ordering', subtitle: 'Safe & encrypted' },
] as const;

export const topFeatures = [
  {
    title: 'Real-time Tracking',
    description:
      'Follow local grocery delivery from Kohsar Plaza to your door with live rider updates in B-17 Islamabad.',
    icon: 'map-pin',
    color: 'bg-red-50 text-primary',
  },
  {
    title: 'Fast Delivery',
    description:
      'Same-day delivery across B-17 — snacks, drinks, household essentials, and more when you need them.',
    icon: 'truck',
    color: 'bg-orange-50 text-accent',
  },
  {
    title: 'Smart Offers',
    description: 'Weekly deals and bundles so families near FMC B-17 save on everyday shopping.',
    icon: 'tag',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    title: 'Return Option',
    description: 'Straightforward returns on eligible items — ask our team in store or in the app.',
    icon: 'rotate-ccw',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    title: 'Household Essentials',
    description:
      'Cleaning, personal care, and daily home needs — your household essentials stop on Main Boulevard.',
    icon: 'home',
    color: 'bg-red-50 text-red-600',
  },
  {
    title: 'Frozen & Dairy',
    description:
      'Dairy and frozen items handled with care from our FMC B-17 store to your doorstep.',
    icon: 'snowflake',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    title: 'Secure Payments',
    description: 'Pay safely with COD, Easypaisa, JazzCash, and more.',
    icon: 'shield-check',
    color: 'bg-red-50 text-red-600',
  },
  {
    title: 'Easy Ordering',
    description:
      'Browse, cart, and checkout in a few taps — built for busy homes in B-17 Islamabad.',
    icon: 'shopping-cart',
    color: 'bg-rose-50 text-rose-600',
  },
] as const;

export const utilities = [
  {
    title: 'Budget Planner',
    description: 'Set monthly grocery budgets and track spending smartly.',
  },
  {
    title: 'Weekly Menu Planner',
    description: 'Plan meals for the week and build your shopping list.',
  },
  {
    title: 'Grocery Reminders',
    description: 'Never forget essentials with smart reminder alerts.',
  },
  {
    title: 'Smart Recipes',
    description: 'Browse recipes and add ingredients to cart instantly.',
  },
  {
    title: 'Family Shared Cart',
    description: 'Share and manage a family cart together in one app.',
  },
  {
    title: 'Shopping Planning',
    description: 'Plan ahead with organized lists and scheduled orders.',
  },
] as const;

export const howItWorksLandingSteps = [
  {
    step: 1,
    title: 'Install oBo Store',
    description: 'Add the PWA to your home screen for fast, app-like ordering.',
  },
  {
    step: 2,
    title: 'Choose Products',
    description: 'Browse categories, search products, and add items to your cart.',
  },
  {
    step: 3,
    title: 'Track & Receive',
    description: 'Follow your order live and receive it at your doorstep.',
  },
] as const;

export const howItWorksSteps = [
  {
    step: 1,
    title: 'Choose Products',
    description: 'Browse categories, search products, and add items to your cart.',
  },
  {
    step: 2,
    title: 'Cart & Checkout',
    description: 'Review your cart, choose delivery, and complete checkout.',
  },
  {
    step: 3,
    title: 'Track & Receive',
    description: 'Follow your order live and receive it at your doorstep.',
  },
  {
    step: 4,
    title: 'Loyalty Rewards',
    description: 'Earn points on every order and redeem on future purchases.',
  },
  {
    step: 5,
    title: 'Offers & Pre-orders',
    description: 'Grab bundle deals and pre-order out-of-stock favorites.',
  },
  {
    step: 6,
    title: 'Install oBo Store',
    description: 'Add to home screen for a fast, app-like PWA experience.',
  },
] as const;

export const stats = [
  { value: '10K+', label: 'Happy Customers' },
  { value: '25K+', label: 'Orders Delivered' },
  { value: '4.8★', label: 'Customer Rating' },
  { value: '99%', label: 'On-time Delivery' },
] as const;

export const productCategories = [
  'Snacks & beverages',
  'Dairy products',
  'Frozen foods',
  'Household essentials',
  'Personal care',
  'Breakfast & pantry staples',
] as const;

export const faqItems = [
  {
    question: 'Where is oBo Store located?',
    answer: 'oBo Store is located at FMC B-17 Kohsar Plaza Main Boulevard, Islamabad.',
  },
  {
    question: 'Does oBo Store offer grocery delivery?',
    answer:
      'Yes, oBo Store offers grocery delivery through its PWA with fast delivery and real-time order tracking.',
  },
  {
    question: 'What products are available at oBo Store?',
    answer:
      'oBo Store offers groceries, snacks, drinks, dairy products, frozen items, household essentials, and daily-use products.',
  },
  {
    question: 'Can I install oBo Store like an app?',
    answer:
      'Yes, oBo Store is a PWA, so you can install it on your phone and use it like an app without Google Play or App Store.',
  },
  {
    question: 'Can I track my order?',
    answer: 'Yes, the oBo Store PWA allows customers to track orders in real time.',
  },
  {
    question: 'Does oBo Store offer returns?',
    answer: 'Yes, oBo Store provides an easy return option for eligible products.',
  },
  {
    question: 'Does oBo Store sell fruits and vegetables?',
    answer:
      'No, oBo Store focuses on packaged groceries, household essentials, snacks, drinks, dairy, and frozen items.',
  },
] as const;

export const footerQuickLinks = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Utilities', href: '/utilities' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

export const footerUtilityLinks = [
  { label: 'Budget Planner', href: '/utilities#budget-planner' },
  { label: 'Weekly Menu Planner', href: '/utilities#menu-planner' },
  { label: 'Grocery Reminders', href: '/utilities#grocery-reminders' },
  { label: 'Smart Recipes', href: '/utilities#smart-recipes' },
  { label: 'Family Shared Cart', href: '/utilities#family-cart' },
  { label: 'Shopping Planning', href: '/utilities#shopping-planning' },
] as const;

export const footerHelpLinks = [
  { label: 'FAQ', href: '/#faq' },
  { label: 'Returns', href: '/return-policy' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Delete Account', href: '/delete-account' },
  { label: 'Terms & Conditions', href: '/terms-and-conditions' },
  { label: 'Contact Support', href: '/contact' },
] as const;

export const footerPolicyLinks = [
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Delete Account', href: '/delete-account' },
  { label: 'Terms and Conditions', href: '/terms-and-conditions' },
  { label: 'Return Policy', href: '/return-policy' },
  { label: 'FAQ', href: '/#faq' },
] as const;
