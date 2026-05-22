import { useRider } from '../../context/RiderContext';
import { useRiderWork } from '../../context/RiderWorkContext';
import type { RiderSummary } from '../../api';

export function DashboardHero({ summary }: { summary: RiderSummary | null }) {
  const { riderName, shopSlug } = useRider();
  const { online, setOnline, onlineBusy, profileLoading } = useRiderWork();
  const initial = (riderName || 'R').charAt(0).toUpperCase();

  return (
    <>
      <div className="r-hero">
        <div className="r-hero__avatar" aria-hidden>
          {initial}
        </div>
        <div>
          <h1 className="r-hero__name">{riderName || 'Rider'}</h1>
          <p className="r-hero__meta">
            {shopSlug ? `${shopSlug} · ` : ''}
            {summary?.delivered_today ?? 0} deliveries today
          </p>
        </div>
      </div>
      <div className="r-toggle-row">
        <div>
          <strong style={{ fontSize: 15 }}>{online ? 'Online' : 'Offline'}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--r-muted)' }}>
            {online ? 'Receiving new assignments' : 'Not accepting orders'}
          </p>
        </div>
        <button
          type="button"
          className={`r-toggle ${online ? 'is-on' : ''}`}
          disabled={onlineBusy || profileLoading}
          aria-pressed={online}
          onClick={() => void setOnline(!online)}
        >
          <span className="r-toggle__knob" />
        </button>
      </div>
    </>
  );
}
