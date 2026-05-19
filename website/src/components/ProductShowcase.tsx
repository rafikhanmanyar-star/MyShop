import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  fetchProducts,
  formatPrice,
  listedPrice,
  productImage,
  type CatalogProduct,
} from '../api/public';
import { siteConfig } from '../config/site';

type Tab = 'popular' | 'deals' | 'new';

const tabs: { id: Tab; label: string; params: Record<string, string> }[] = [
  { id: 'popular', label: 'Popular', params: { limit: '12', sortBy: 'best_selling' } },
  { id: 'deals', label: 'Deals', params: { limit: '12', onSale: 'true' } },
  { id: 'new', label: 'New arrivals', params: { limit: '12', sortBy: 'newest' } },
];

function ProductCard({ product, orderBase }: { product: CatalogProduct; orderBase: string }) {
  const img = productImage(product);
  const price = listedPrice(product);
  const href = `${orderBase}/products/${product.id}`;

  return (
    <a
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-square bg-slate-50">
        {img ? (
          <img src={img} alt={product.name} className="h-full w-full object-contain p-3" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
        )}
        {product.on_sale && (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
            Sale
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-primary">{product.name}</h3>
        <p className="mt-auto pt-2 text-base font-bold text-primary">{price != null ? formatPrice(price) : 'See price'}</p>
      </div>
    </a>
  );
}

export default function ProductShowcase() {
  const [tab, setTab] = useState<Tab>('popular');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const current = tabs.find((t) => t.id === tab)!;
    setLoading(true);
    setError('');
    fetchProducts(siteConfig.shopSlug, current.params)
      .then((data) => {
        const items = (data.items || []).filter((p) => listedPrice(p) != null);
        setProducts(items);
      })
      .catch((e: Error) => {
        setProducts([]);
        setError(e.message || 'Could not load products');
      })
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <section id="products" className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className="section-pad">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Shop our catalog</h2>
            <p className="mt-2 max-w-xl text-slate-600">
              Real products from our store — tap any item to open it in the ordering app and add to cart.
            </p>
          </div>
          <a
            href={siteConfig.shopProductsUrl}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            View full catalog <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-8 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-12 flex justify-center text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && error && (
          <p className="mt-12 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}. You can still{' '}
            <a href={siteConfig.shopOrderUrl} className="font-semibold underline">
              browse in the shop app
            </a>
            .
          </p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="mt-12 text-center text-slate-500">No products in this category right now.</p>
        )}

        {!loading && products.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} orderBase={siteConfig.shopOrderUrl.replace(/\/$/, '')} />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <a
            href={siteConfig.shopOrderUrl}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-primary-dark"
          >
            Order now in the shop app <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
