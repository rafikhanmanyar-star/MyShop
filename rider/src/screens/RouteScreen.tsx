import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { riderApi } from '../api';

export default function RouteScreen() {
  const nav = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['rider-route'],
    queryFn: () => riderApi.getOptimizedRoute(),
    retry: 1,
  });

  return (
    <div className="r-page">
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Smart route</h2>
      <p style={{ color: 'var(--r-muted)', marginBottom: 16 }}>
        Optimized delivery sequence from your GPS through active stops.
      </p>
      <button type="button" className="r-btn r-btn--outline" disabled={isFetching} onClick={() => void refetch()}>
        {isFetching ? 'Optimizing…' : 'Refresh route'}
      </button>
      {isLoading ? <div className="r-skeleton" style={{ height: 120, marginTop: 16 }} /> : null}
      {error ? <p style={{ color: 'var(--r-danger)', marginTop: 12 }}>{(error as Error).message}</p> : null}
      {data?.stops?.length ? (
        <>
          <p style={{ fontWeight: 700, margin: '16px 0 8px' }}>
            {data.total_km} km · ~{data.total_minutes} min · {data.stops.length} stops
          </p>
          {data.stops.map((s) => (
            <div key={s.order_id} className="r-card" style={{ marginBottom: 10 }}>
              <span className="r-badge r-badge--route">Stop {s.sequence}</span>
              <strong style={{ display: 'block', marginTop: 8 }}>#{s.order_number} · {s.customer_name}</strong>
              <p style={{ margin: '6px 0', color: 'var(--r-muted)', fontSize: 14 }}>{s.delivery_address}</p>
              {s.leg_km != null ? (
                <p style={{ fontSize: 13 }}>Leg: {s.leg_km} km · ~{s.leg_minutes} min</p>
              ) : null}
              <button
                type="button"
                className="r-btn r-btn--accent"
                style={{ marginTop: 10 }}
                onClick={() => nav(`/order/${s.order_id}`)}
              >
                Open delivery
              </button>
            </div>
          ))}
        </>
      ) : !isLoading && !error ? (
        <p style={{ color: 'var(--r-muted)', marginTop: 16 }}>No active deliveries to sequence.</p>
      ) : null}
    </div>
  );
}
