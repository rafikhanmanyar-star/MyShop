import { memo } from 'react';
import { Link } from 'react-router-dom';
import CategoryRailIcon from '../CategoryRailIcon';

export type CategoryScrollerItem = {
  id: string;
  name: string;
  mobile_icon_url?: string | null;
};

type QuickChip = {
  key: string;
  to: string;
  label: string;
  icon: string;
  iconClass: string;
};

type Props = {
  shopSlug: string;
  categories: CategoryScrollerItem[];
};

const QUICK_CHIPS: QuickChip[] = [
  { key: 'all', to: '', label: 'All Items', icon: '📦', iconClass: 'category-nav-item__icon--indigo' },
  { key: 'stock', to: '?filterInStock=true', label: 'In Stock', icon: '✓', iconClass: 'category-nav-item__icon--emerald' },
  { key: 'popular', to: '?browse=popular', label: 'Popular', icon: '⭐', iconClass: 'category-nav-item__icon--amber' },
  { key: 'deals', to: '?filterDeals=true', label: 'Deals', icon: '%', iconClass: 'category-nav-item__icon--rose' },
  { key: 'low', to: '?sortBy=price_low_high', label: 'Low Price', icon: '↓', iconClass: 'category-nav-item__icon--cyan' },
  { key: 'return', to: '/utilities', label: 'Easy Return', icon: '↩', iconClass: 'category-nav-item__icon--violet' },
];

/** Horizontal compact category chips — Blinkit/Zepto-style density. */
function CategoryScroller({ shopSlug, categories }: Props) {
  const base = `/${shopSlug}/products`;

  return (
    <nav className="category-nav-rail category-nav-rail--home" aria-label="Quick categories">
      {QUICK_CHIPS.map((chip) => (
        <Link
          key={chip.key}
          to={chip.key === 'return' ? `/${shopSlug}/utilities` : `${base}${chip.to}`}
          className="category-nav-item category-nav-item--link category-nav-item--chip category-nav-item--compact"
        >
          <span className={`category-nav-item__icon ${chip.iconClass}`} aria-hidden>
            {chip.icon}
          </span>
          <span className="category-nav-item__label">{chip.label}</span>
        </Link>
      ))}
      {categories.map((c) => (
        <Link
          key={c.id}
          to={`${base}?category=${c.id}`}
          className="category-nav-item category-nav-item--link category-nav-item--chip category-nav-item--compact"
        >
          <CategoryRailIcon mobile_icon_url={c.mobile_icon_url} />
          <span className="category-nav-item__label">{c.name}</span>
        </Link>
      ))}
    </nav>
  );
}

export default memo(CategoryScroller);
