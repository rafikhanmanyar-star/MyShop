import type { RiderSummary } from '../../api';
import { formatPkr } from '../../utils/deliveryStatus';

export function SummaryCards({ summary }: { summary: RiderSummary | null }) {
  const s = summary;
  const cards = [
    { label: 'Assigned', value: String(s?.assigned_pending ?? 0) },
    { label: 'Pickups', value: String(s?.pickup_pending ?? 0) },
    { label: 'Active', value: String(s?.deliveries_pending ?? 0) },
    { label: 'COD pending', value: formatPkr(s?.cod_pending ?? 0) },
    { label: 'COD today', value: formatPkr(s?.cod_collected_today ?? 0) },
    { label: 'Delivered', value: String(s?.delivered_today ?? 0) },
  ];

  return (
    <div className="r-stat-grid">
      {cards.map((c) => (
        <div key={c.label} className="r-stat-card">
          <div className="r-stat-card__label">{c.label}</div>
          <div className="r-stat-card__value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
