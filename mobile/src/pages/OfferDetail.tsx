import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi } from '../api';
import { getFullImageUrl } from '../api';
import { useApp } from '../context/AppContext';
import CachedImage from '../components/CachedImage';
import { buildOfferCartItem, type OfferDetailResponse } from './offers/offerCartHelpers';
import { computeBundleBasePrice, computeOfferBundlePricing, type OfferType } from '../utils/offerPricing';

export default function OfferDetail() {
  const { shopSlug, id } = useParams();
  const navigate = useNavigate();
  const { dispatch, showToast } = useApp();
  const [offer, setOffer] = useState<OfferDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!shopSlug || !id) return;
    publicApi
      .getOffer(shopSlug, id)
      .then((data: OfferDetailResponse) => setOffer(data))
      .catch(() => showToast('Offer not found'))
      .finally(() => setLoading(false));
  }, [shopSlug, id, showToast]);

  const preview = useMemo(() => {
    if (!offer) return null;
    try {
      return buildOfferCartItem(offer, qty);
    } catch {
      return null;
    }
  }, [offer, qty]);

  const formatPrice = (p: number) => `Rs. ${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const handleAdd = () => {
    if (!offer) return;
    try {
      const item = buildOfferCartItem(offer, qty);
      dispatch({ type: 'ADD_OFFER_BUNDLE', item });
      showToast(`Added ${offer.title} to cart`);
      navigate(`/${shopSlug}/cart`);
    } catch {
      showToast('Could not add offer');
    }
  };

  if (loading || !offer) {
    return (
      <div className="page fade-in" style={{ padding: 24, textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  const lines = offer.items.map(i => ({
    unitPrice: Number(i.unit_price) || 0,
    quantity: Number(i.quantity) || 0,
  }));
  const base = computeBundleBasePrice(lines);
  const { finalSubtotal, discountFromBase } = computeOfferBundlePricing(
    offer.offer_type as OfferType,
    offer.discount_type as 'percentage' | 'fixed' | null,
    offer.discount_value != null ? Number(offer.discount_value) : null,
    offer.fixed_price != null ? Number(offer.fixed_price) : null,
    base
  );

  const lineTotal =
    preview != null ? (preview.merchandisePerBundle + preview.taxPerBundle) * preview.quantity : 0;

  return (
    <div className="page slide-up">
      <div className="page-header">
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
        </button>
        <h1 style={{ flex: 1, marginLeft: 8 }}>{offer.title}</h1>
      </div>

      <div
        style={{
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <span
            style={{
              background: 'var(--primary)',
              color: 'white',
              fontSize: 11,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            LIMITED
          </span>
          {discountFromBase > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              Save {formatPrice(discountFromBase)} per set
            </span>
          )}
        </div>

        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
          {offer.offer_type === 'discount' && (
            <p>
              Bundle value {formatPrice(base)} → <strong>{formatPrice(finalSubtotal)}</strong> per set (before tax).
            </p>
          )}
          {(offer.offer_type === 'bundle' || offer.offer_type === 'fixed_price') && (
            <p>
              Fixed bundle price <strong>{formatPrice(finalSubtotal)}</strong> per set (list {formatPrice(base)}).
            </p>
          )}
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Included products</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offer.items.map(i => (
            <div
              key={`${i.product_id}`}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: 10,
              }}
            >
              <div className="item-image" style={{ width: 56, height: 56, flexShrink: 0 }}>
                <CachedImage
                  path={getFullImageUrl((i as { image_url?: string }).image_url)}
                  alt={(i as { name?: string }).name || 'Product'}
                  fallbackLabel={(i as { name?: string }).name || 'Product'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{(i as { name?: string }).name || 'Product'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Qty {i.quantity} × {formatPrice(Number(i.unit_price))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>Sets</span>
          <div className="qty-controls" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))}>
              −
            </button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty(q => q + 1)}>
              +
            </button>
          </div>
        </div>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleAdd}>
          Add offer to cart{preview ? ` — ${formatPrice(lineTotal)}` : ''}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          Final price confirmed at checkout (includes tax).
        </p>
      </div>
    </div>
  );
}
