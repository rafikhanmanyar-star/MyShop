export const siteConfig = {
  name: 'oBo Store',
  shortName: 'oBo',
  brand: 'oBo store',
  title: 'oBo Store | Smart Grocery Store in B-17 Islamabad',
  description:
    'Install oBo Store PWA to order groceries, snacks, dairy, frozen items, and household essentials from FMC B-17 Kohsar Plaza Main Boulevard with fast delivery and real-time tracking.',
  url: 'https://obostore.com',
  address: 'FMC B-17 Kohsar Plaza Main Boulevard',
  city: 'Islamabad',
  phone: '+92 300 1234567',
  email: 'support@obostore.com',
  promoCode: 'OBOFIRST',
  themeColor: '#1F7A63',
  backgroundColor: '#F7F9F8',
  hours: 'Open Daily 9:00 AM - 11:00 PM',
} as const;

export const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'Utilities', href: '#utilities' },
  { label: 'About Us', href: '#about' },
  { label: 'Contact', href: '#contact' },
] as const;

export const trustFeatures = [
  { title: 'Fast Delivery', subtitle: 'At your doorstep' },
  { title: 'Real-time Tracking', subtitle: 'Track your order live' },
  { title: 'Low Prices', subtitle: 'Best value every day' },
  { title: 'Return Available', subtitle: 'Easy returns policy' },
  { title: 'Trusted Local Store', subtitle: 'Your neighborhood shop' },
  { title: 'Secure Ordering', subtitle: 'Safe & encrypted' },
] as const;

export const topFeatures = [
  {
    title: 'Real-time Tracking',
    description: 'Track your order live from store to doorstep with live rider updates.',
    icon: 'map-pin',
    color: 'bg-emerald-50 text-primary',
  },
  {
    title: 'Fast Delivery',
    description: 'Quick delivery to your home with reliable on-time service.',
    icon: 'truck',
    color: 'bg-orange-50 text-accent',
  },
  {
    title: 'Smart Offers',
    description: 'Exclusive deals, bundle offers, and seasonal discounts every week.',
    icon: 'tag',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    title: 'Return Option',
    description: 'Easy returns on eligible items with hassle-free support.',
    icon: 'rotate-ccw',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    title: 'Household Essentials',
    description: 'Everything from cleaning supplies to daily household needs.',
    icon: 'home',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    title: 'Frozen & Dairy',
    description: 'Fresh dairy and frozen items delivered with care.',
    icon: 'snowflake',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    title: 'Secure Payments',
    description: 'Pay safely with COD, Easypaisa, JazzCash, and more.',
    icon: 'shield-check',
    color: 'bg-green-50 text-green-600',
  },
  {
    title: 'Easy Ordering',
    description: 'Simple browse, cart, and checkout in just a few taps.',
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

export const footerQuickLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'Utilities', href: '#utilities' },
  { label: 'About Us', href: '#about' },
  { label: 'Contact', href: '#contact' },
] as const;

export const footerUtilities = [
  'Budget Planner',
  'Weekly Menu Planner',
  'Grocery Reminders',
  'Smart Recipes',
  'Family Shared Cart',
  'Shopping Planning',
] as const;

export const footerHelp = [
  'FAQ',
  'Returns Policy',
  'Privacy Policy',
  'Terms of Service',
  'Delivery Info',
] as const;
