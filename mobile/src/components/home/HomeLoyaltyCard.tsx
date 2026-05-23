import { memo } from 'react';
import { Link } from 'react-router-dom';

type LoyaltyState = {
  fetchFailed: boolean;
  totalPoints: number | null;
};

type Props = {
  shopSlug: string;
  brandName: string;
  loyalty: LoyaltyState;
};

/** Compact rewards strip — ~30% shorter than the previous rich card. */
function HomeLoyaltyCard({ shopSlug, brandName, loyalty }: Props) {
  return (
    <div className="home-loyalty-card home-loyalty-card--compact">
      <div className="home-loyalty-card__main">
        <span className="home-loyalty-card__icon" aria-hidden>
          🎁
        </span>
        <div className="home-loyalty-card__text">
          <p className="home-loyalty-card__brand-line">{brandName}</p>
          {loyalty.fetchFailed && loyalty.totalPoints == null ? (
            <p className="home-loyalty-card__points">Points unavailable</p>
          ) : loyalty.totalPoints == null && !loyalty.fetchFailed ? (
            <p className="home-loyalty-card__points home-loyalty-card__loading">Loading…</p>
          ) : (
            <>
              <p className="home-loyalty-card__points">
                <strong>{(loyalty.totalPoints ?? 0).toLocaleString()}</strong> pts
              </p>
              {loyalty.fetchFailed ? (
                <p className="home-loyalty-card__hint home-loyalty-card__hint--muted">Last saved balance</p>
              ) : null}
              <div className="home-loyalty-card__progress" aria-hidden>
                <span className="home-loyalty-card__progress-fill" />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="home-loyalty-card__actions">
        <Link to={`/${shopSlug}/loyalty/history`} className="home-loyalty-card__cta home-loyalty-card__cta--ghost">
          History
        </Link>
        <Link to={`/${shopSlug}/loyalty/benefits`} className="home-loyalty-card__cta">
          Benefits →
        </Link>
      </div>
    </div>
  );
}

export default memo(HomeLoyaltyCard);
