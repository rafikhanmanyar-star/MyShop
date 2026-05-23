import { useQuery } from '@tanstack/react-query';
import { riderApi } from '../api';
import { formatPkr } from '../utils/deliveryStatus';
import { useRiderWork } from '../context/RiderWorkContext';

export default function EarningsScreen() {
  const { deliveryFeedRevision } = useRiderWork();
  const { data, isLoading } = useQuery({
    queryKey: ['rider-analytics', deliveryFeedRevision],
    queryFn: () => riderApi.getAnalytics(7),
  });

  return (
    <div className="r-page">
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Performance</h2>
      {isLoading ? <div className="r-skeleton" style={{ height: 160 }} /> : null}
      {data ? (
        <>
          <div className="r-stat-grid">
            <div className="r-stat-card">
              <div className="r-stat-card__label">Today</div>
              <div className="r-stat-card__value">{data.delivered_today}</div>
            </div>
            <div className="r-stat-card">
              <div className="r-stat-card__label">7-day deliveries</div>
              <div className="r-stat-card__value">{data.completed}</div>
            </div>
            <div className="r-stat-card">
              <div className="r-stat-card__label">Success rate</div>
              <div className="r-stat-card__value">{data.success_rate}%</div>
            </div>
            <div className="r-stat-card">
              <div className="r-stat-card__label">COD collected</div>
              <div className="r-stat-card__value" style={{ fontSize: 16 }}>
                {formatPkr(data.cod_collected)}
              </div>
            </div>
            <div className="r-stat-card">
              <div className="r-stat-card__label">Distance (est.)</div>
              <div className="r-stat-card__value" style={{ fontSize: 18 }}>
                {data.distance_km} km
              </div>
            </div>
            <div className="r-stat-card">
              <div className="r-stat-card__label">Avg time</div>
              <div className="r-stat-card__value" style={{ fontSize: 18 }}>
                {data.avg_delivery_minutes != null ? `${data.avg_delivery_minutes}m` : '—'}
              </div>
            </div>
          </div>
          {data.daily.length ? (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Daily breakdown</h3>
              {data.daily.map((d) => (
                <div key={d.day} className="r-card" style={{ marginBottom: 8, padding: 12 }}>
                  <strong>{d.day}</strong>
                  <span style={{ float: 'right' }}>
                    {d.deliveries} · {formatPkr(d.cod)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
