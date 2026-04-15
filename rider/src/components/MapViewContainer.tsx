import { useEffect, useState } from 'react';

type Props = {
  customerLat: number | null;
  customerLng: number | null;
  /** When set, overrides live GPS for the rider dot (e.g. from profile). */
  riderLat?: number | null;
  riderLng?: number | null;
};

/**
 * Lightweight map strip: live rider position + customer drop-off.
 * Uses device GPS when available; no third-party map tiles (no API key).
 */
export function MapViewContainer({ customerLat, customerLng, riderLat: riderLatProp, riderLng: riderLngProp }: Props) {
  const [liveLat, setLiveLat] = useState<number | null>(null);
  const [liveLng, setLiveLng] = useState<number | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLat(pos.coords.latitude);
        setLiveLng(pos.coords.longitude);
      },
      () => {
        /* ignore */
      },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const riderLat = riderLatProp ?? liveLat;
  const riderLng = riderLngProp ?? liveLng;

  let cx = 50;
  let cy = 50;
  let rx = 30;
  let ry = 55;
  if (
    riderLat != null &&
    riderLng != null &&
    customerLat != null &&
    customerLng != null &&
    Number.isFinite(riderLat) &&
    Number.isFinite(riderLng) &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng)
  ) {
    const minLat = Math.min(riderLat, customerLat);
    const maxLat = Math.max(riderLat, customerLat);
    const minLng = Math.min(riderLng, customerLng);
    const maxLng = Math.max(riderLng, customerLng);
    const dLat = Math.max(maxLat - minLat, 0.0002);
    const dLng = Math.max(maxLng - minLng, 0.0002);
    cx = 10 + ((customerLng - minLng) / dLng) * 80;
    cy = 10 + ((maxLat - customerLat) / dLat) * 80;
    rx = 10 + ((riderLng - minLng) / dLng) * 80;
    ry = 10 + ((maxLat - riderLat) / dLat) * 80;
  }

  const hasCustomer =
    customerLat != null &&
    customerLng != null &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng);
  const hasRider = riderLat != null && riderLng != null;

  return (
    <div className="map-view">
      <div className="map-view__grid" />
      {hasCustomer ? (
        <svg className="map-view__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="mapg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#mapg)" />
          {hasRider ? (
            <line x1={rx} y1={ry} x2={cx} y2={cy} stroke="rgba(56,189,248,0.35)" strokeWidth="0.8" />
          ) : null}
          <circle cx={cx} cy={cy} r="3.2" fill="#f472b6" stroke="#fff" strokeWidth="0.6" />
          {hasRider ? <circle cx={rx} cy={ry} r="3" fill="#38bdf8" stroke="#0f172a" strokeWidth="0.7" /> : null}
        </svg>
      ) : (
        <div className="map-view__placeholder">No drop-off coordinates</div>
      )}
      <div className="map-view__legend">
        <span>
          <span className="map-view__dot map-view__dot--rider" /> You
        </span>
        <span>
          <span className="map-view__dot map-view__dot--cust" /> Customer
        </span>
      </div>
    </div>
  );
}
