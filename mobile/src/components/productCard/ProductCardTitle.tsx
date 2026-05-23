import { memo, useMemo } from 'react';
import { splitProductName } from './splitProductName';

type Props = {
  name: string;
};

/**
 * Dual-language product title — Inter for Latin, Noto Sans Arabic for Urdu.
 * Memoized name parsing avoids work during fast scroll re-renders.
 */
function ProductCardTitle({ name }: Props) {
  const parsed = useMemo(() => splitProductName(name), [name]);

  if (!parsed.primary && !parsed.secondary) return null;

  const primaryClass = parsed.allUrdu
    ? 'product-card__name product-card__name--urdu'
    : 'product-card__name';

  return (
    <div className="product-card__title-block">
      <div className={primaryClass} dir={parsed.allUrdu ? 'rtl' : undefined}>
        {parsed.primary}
      </div>
      {parsed.secondary ? (
        <div className="product-card__subtitle" dir="rtl" lang="ur">
          {parsed.secondary}
        </div>
      ) : null}
    </div>
  );
}

export default memo(ProductCardTitle);
