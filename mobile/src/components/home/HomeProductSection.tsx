import { memo } from 'react';
import { Link } from 'react-router-dom';
import ProductListCard, { type ProductListProduct } from '../ProductListCard';

type Props = {
  title: string;
  items: ProductListProduct[];
  viewAllQuery: string;
  shopSlug: string;
  cartQtyMap: Map<string, number>;
  formatPrice: (p: number | string | null | undefined) => string;
  onAddOne: (product: ProductListProduct) => void;
  onChangeQty: (productId: string, quantity: number) => void;
};

/** Horizontal product rail with compact cards — memoized for scroll performance. */
function HomeProductSection({
  title,
  items,
  viewAllQuery,
  shopSlug,
  cartQtyMap,
  formatPrice,
  onAddOne,
  onChangeQty,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="home-product-section">
      <div className="home-product-section__head">
        <h2 className="home-section-title">{title}</h2>
        <Link to={`/${shopSlug}/products${viewAllQuery}`} className="home-section-link">
          View all
        </Link>
      </div>
      <div className="home-product-row">
        {items.map((p) => (
          <div key={p.id} className="home-product-row__cell">
            <ProductListCard
              product={p}
              shopSlug={shopSlug}
              cartQty={cartQtyMap.get(p.id) ?? 0}
              formatPrice={formatPrice}
              unavailableStyle={false}
              density="compact"
              onAddOne={onAddOne}
              onChangeQty={onChangeQty}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(HomeProductSection);
