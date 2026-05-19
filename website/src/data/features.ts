import {
  ShoppingBag,
  Truck,
  Gift,
  Smartphone,
  MapPin,
  CreditCard,
  ChefHat,
  CalendarDays,
  Wallet,
  Search,
  Package,
  BarChart3,
  Store,
  Users,
  Bike,
  Navigation,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const orderingFeatures: Feature[] = [
  {
    icon: Search,
    title: 'Browse & search',
    description: 'Find products by name, brand, or category. Filter deals, popular items, and in-stock products.',
  },
  {
    icon: ShoppingBag,
    title: 'Cart & checkout',
    description: 'Add to cart, choose delivery or self-collection, and pay with cash on delivery or mobile wallets.',
  },
  {
    icon: Truck,
    title: 'Delivery & tracking',
    description: 'Pin your address on the map, schedule a slot, and follow your order live when the rider is on the way.',
  },
  {
    icon: Gift,
    title: 'Loyalty rewards',
    description: 'Earn points on every order and redeem them on future purchases.',
  },
  {
    icon: Package,
    title: 'Offers & pre-orders',
    description: 'Bundle deals and promotional offers. Pre-order items when they are temporarily out of stock.',
  },
  {
    icon: Smartphone,
    title: 'Installable app',
    description: 'Add oBo stores to your home screen — works like an app, updates automatically, and orders offline when needed.',
  },
];

export const lifestyleFeatures: Feature[] = [
  {
    icon: Wallet,
    title: 'Budget planner',
    description: 'Set monthly grocery budgets, track spending, and get alerts before you overspend.',
  },
  {
    icon: ChefHat,
    title: 'Recipes',
    description: 'Browse shop recipes and add ingredients to your cart in one tap.',
  },
  {
    icon: CalendarDays,
    title: 'Weekly menu planner',
    description: 'Plan meals for the week, build a shopping list, and send in-stock items straight to checkout.',
  },
];

export const posFeatures: Feature[] = [
  { icon: Store, title: 'Point of sale', description: 'Fast checkout, barcode scan, receipts, and cashier shifts.' },
  { icon: ClipboardList, title: 'Mobile orders inbox', description: 'Accept and fulfill online orders from the same counter.' },
  { icon: Package, title: 'Inventory & procurement', description: 'Stock levels, purchase bills, vendors, and valuations.' },
  { icon: BarChart3, title: 'Reports & accounting', description: 'Sales analytics, GL, expenses, khata ledger, and multi-branch insights.' },
  { icon: Users, title: 'Loyalty & branding', description: 'Manage members, campaigns, and how your shop looks in the mobile app.' },
];

export const riderFeatures: Feature[] = [
  { icon: Bike, title: 'Delivery assignments', description: 'See assigned orders, go online/offline, and accept new deliveries.' },
  { icon: Navigation, title: 'Maps & navigation', description: 'Live map, ETA, and one-tap open in Google Maps to the customer.' },
  { icon: MapPin, title: 'Status workflow', description: 'Picked up → on the way → delivered, with customer call from the order screen.' },
];

export const orderSteps = [
  { step: '1', title: 'Browse', text: 'Open the shop, search products, and add items to your cart.' },
  { step: '2', title: 'Checkout', text: 'Choose delivery or pickup, payment method, and your address.' },
  { step: '3', title: 'Track', text: 'Get updates and watch your rider on the map when the order is out for delivery.' },
];

export const paymentMethods = [
  { icon: CreditCard, label: 'Easypaisa / JazzCash' },
  { icon: Truck, label: 'Cash on delivery' },
  { icon: MapPin, label: 'Self-collection' },
];
