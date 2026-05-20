import {
  CheckCircle2,
  Clock3,
  House,
  MapPin,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  User,
} from '@/components/icons';
import { siteConfig } from '@/lib/data';

const categories = ['Snacks', 'Dairy', 'Beverages', 'Household', 'Frozen'];

const products = [
  { name: 'Fresh Milk 1L', price: 'Rs. 280', color: 'bg-blue-100' },
  { name: 'Potato Chips', price: 'Rs. 150', color: 'bg-orange-100' },
  { name: 'Orange Juice', price: 'Rs. 320', color: 'bg-yellow-100' },
  { name: 'Detergent 2kg', price: 'Rs. 890', color: 'bg-purple-100' },
];

export default function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[320px] lg:max-w-[360px]" aria-hidden="true">
      {/* Floating cards */}
      <div className="absolute -left-4 top-8 z-10 hidden w-44 rounded-2xl border border-border bg-white p-3 shadow-card sm:block lg:-left-16">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-emerald-50 p-1.5">
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-dark">Fast Delivery</p>
            <p className="text-[10px] text-muted">Your order is on the way</p>
          </div>
        </div>
      </div>

      <div className="absolute -right-2 top-32 z-10 hidden w-48 rounded-2xl border border-border bg-white p-3 shadow-card sm:block lg:-right-12">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-emerald-50 p-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-dark">Order Delivered</p>
            <p className="text-[10px] text-muted">Your order has been delivered successfully</p>
          </div>
        </div>
      </div>

      <div className="absolute -right-4 bottom-24 z-10 hidden w-40 rounded-2xl border border-border bg-white p-3 shadow-card sm:block lg:-right-8">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold text-text-dark">Arriving in 15 min</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full w-3/4 rounded-full bg-primary" />
        </div>
      </div>

      {/* Phone frame */}
      <div className="relative rotate-[-4deg] rounded-[2.5rem] border-[10px] border-text-dark bg-text-dark p-1 shadow-card-lg">
        <div className="overflow-hidden rounded-[2rem] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-primary px-4 py-2 text-[10px] text-white">
            <span>9:41</span>
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-white/80" />
              <span className="h-2 w-2 rounded-full bg-white/80" />
              <span className="h-2 w-2 rounded-full bg-white/80" />
            </div>
          </div>

          {/* App header */}
          <div className="bg-primary px-3 pb-3 pt-2 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4" />
                <span className="text-sm font-bold">{siteConfig.brand}</span>
              </div>
              <User className="h-4 w-4" />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-white/90">
              <MapPin className="h-3 w-3" />
              <span>{siteConfig.address}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5">
              <Search className="h-3 w-3 text-white/70" />
              <span className="text-[10px] text-white/70">Search products...</span>
            </div>
          </div>

          {/* Offer banner */}
          <div className="mx-3 mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-accent to-orange-400 px-3 py-2 text-white">
            <div>
              <p className="text-[10px] font-medium opacity-90">Special Offer</p>
              <p className="text-sm font-bold">Up to 40% OFF</p>
            </div>
            <Tag className="h-5 w-5 opacity-80" />
          </div>

          {/* Categories */}
          <div className="mt-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {categories.map((cat, i) => (
              <span
                key={cat}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                  i === 0 ? 'bg-primary text-white' : 'bg-background text-muted'
                }`}
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Products grid */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {products.map((product) => (
              <div key={product.name} className="overflow-hidden rounded-xl border border-border">
                <div className={`h-14 ${product.color}`} />
                <div className="p-2">
                  <p className="text-[10px] font-medium text-text-dark">{product.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary">{product.price}</span>
                    <span className="rounded-md bg-primary px-1.5 py-0.5 text-[8px] font-semibold text-white">
                      Add
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around border-t border-border py-2">
            <House className="h-4 w-4 text-primary" />
            <Search className="h-4 w-4 text-muted" />
            <ShoppingBag className="h-4 w-4 text-muted" />
            <User className="h-4 w-4 text-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
