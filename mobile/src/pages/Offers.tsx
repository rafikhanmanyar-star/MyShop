import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi } from '../api';

type OfferRow = {
  id: string;
  title: string;
  description?: string | null;
  offer_type: string;
  discount_type?: string | null;
  discount_value?: number | null;
  fixed_price?: number | null;
  start_date?: string;
  end_date?: string;
};

function badgeText(o: OfferRow): string {
  if (o.offer_type === 'discount') {
    if (o.discount_type === 'percentage' && o.discount_value != null) return `${o.discount_value}% OFF`;
    if (o.discount_type === 'fixed' && o.discount_value != null) return `Rs. ${o.discount_value} OFF`;
  }
  if (o.fixed_price != null) return `Rs. ${o.fixed_price}`;
  return 'OFFER';
}

export default function Offers() {
  const { shopSlug } = useParams();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!shopSlug) return;
    publicApi
      .getOffers(shopSlug)
      .then((data: OfferRow[]) => setOffers(Array.isArray(data) ? data : []))
      .catch(() => setErr('Could not load offers'))
      .finally(() => setLoading(false));
  }, [shopSlug]);

  if (loading) {
    return (
      <div className="page fade-in" style={{ padding: 24, textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
        <p style={{ marginTop: 12 }}>Loading offers…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="page fade-in" style={{ padding: 24 }}>
        <p style={{ color: 'crimson' }}>{err}</p>
      </div>
    );
  }

  return (
    <div className="page slide-up">
      <div className="page-header">
        <h1>Offers</h1>
      </div>
      {offers.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          No active promotions right now. Check back soon.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {offers.map(o => {
            const end = o.end_date ? new Date(o.end_date) : null;
            const endStr = end && !Number.isNaN(+end) ? end.toLocaleDateString() : '';
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => navigate(`/${shopSlug}/offers/${o.id}`)}
                style={{
                  textAlign: 'left',
                  background: 'white',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 16,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{o.title}</div>
                    {o.description && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>{o.description}</div>
                    )}
                    {endStr && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Ends {endStr}</div>
                    )}
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: 15,
                      padding: '6px 14px',
                      borderRadius: 999,
                    }}
                  >
                    {badgeText(o)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
