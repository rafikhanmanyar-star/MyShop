import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DirectionsRenderer, GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { riderApi } from '../api';
import { haversineMeters } from '../utils/geo';
import { MapViewContainer } from './MapViewContainer';

const mapContainerStyle: CSSProperties = { width: '100%', height: '100%' };

const RECALC_COOLDOWN_MS = 5000;
const SERVER_POST_MS = 5000;
const DEVIATION_M = 50;

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '');
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || d.innerText || '').trim();
}

export type RouteInfo = {
  distanceText: string;
  durationText: string;
  nextInstruction?: string;
};

type InnerProps = {
  apiKey: string;
  customerLat: number | null;
  customerLng: number | null;
  onRouteInfo?: (info: RouteInfo | null) => void;
  onRiderPosition?: (pos: { lat: number; lng: number } | null) => void;
};

/**
 * Google Map + driving directions. Recalculates when rider moves ≥50 m and ≥5 s since last request.
 */
function GoogleDeliveryMapLoaded({ apiKey, customerLat, customerLng, onRouteInfo, onRiderPosition }: InnerProps) {
  const onRouteInfoRef = useRef(onRouteInfo);
  onRouteInfoRef.current = onRouteInfo;
  const onRiderPositionRef = useRef(onRiderPosition);
  onRiderPositionRef.current = onRiderPosition;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'rider-google-maps',
    googleMapsApiKey: apiKey,
    libraries: ['geometry'],
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [fallbackLine, setFallbackLine] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [riderMarker, setRiderMarker] = useState<google.maps.LatLngLiteral | null>(null);
  const [geoWarn, setGeoWarn] = useState<string | null>(null);
  const [routeRequestId, setRouteRequestId] = useState(0);

  const riderPosRef = useRef<google.maps.LatLngLiteral | null>(null);
  const lastRouteOriginRef = useRef<google.maps.LatLngLiteral | null>(null);
  const lastRouteAtRef = useRef(0);
  const lastServerPostRef = useRef(0);

  const scheduleRouteIfNeeded = useCallback((lat: number, lng: number) => {
    if (customerLat == null || customerLng == null) return;
    const now = Date.now();
    const first = lastRouteOriginRef.current === null;
    const cooldownOk = first || now - lastRouteAtRef.current >= RECALC_COOLDOWN_MS;
    const movedEnough =
      first ||
      (lastRouteOriginRef.current
        ? haversineMeters(lat, lng, lastRouteOriginRef.current.lat, lastRouteOriginRef.current.lng) >=
          DEVIATION_M
        : true);

    if (!cooldownOk || !movedEnough) return;

    lastRouteAtRef.current = now;
    lastRouteOriginRef.current = { lat, lng };
    setRouteRequestId((n) => n + 1);
  }, [customerLat, customerLng]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoWarn('GPS not supported on this device.');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoWarn(null);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const p = { lat, lng };
        riderPosRef.current = p;
        setRiderMarker(p);
        onRiderPositionRef.current?.(p);
        scheduleRouteIfNeeded(lat, lng);

        const now = Date.now();
        if (now - lastServerPostRef.current >= SERVER_POST_MS) {
          lastServerPostRef.current = now;
          void riderApi.postLocation({ latitude: lat, longitude: lng }).catch(() => {});
        }
      },
      (err) => {
        onRiderPositionRef.current?.(null);
        if (err.code === 1) {
          setGeoWarn('Location permission denied. Enable GPS for navigation.');
        } else {
          setGeoWarn('Could not read GPS.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [scheduleRouteIfNeeded]);

  useEffect(() => {
    if (riderPosRef.current && customerLat != null && customerLng != null) {
      scheduleRouteIfNeeded(riderPosRef.current.lat, riderPosRef.current.lng);
    }
  }, [customerLat, customerLng, scheduleRouteIfNeeded]);

  useEffect(() => {
    if (!isLoaded || loadError) return;
    if (customerLat == null || customerLng == null) {
      setDirections(null);
      setFallbackLine(null);
      onRouteInfoRef.current?.(null);
      return;
    }
    const pos = riderPosRef.current;
    if (!pos) return;

    let cancelled = false;
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin: pos,
        destination: { lat: customerLat, lng: customerLng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return;
        if (status === google.maps.DirectionsStatus.OK && result && result.routes[0]) {
          setDirections(result);
          setFallbackLine(null);
          const leg = result.routes[0].legs[0];
          const step0 = leg.steps[0];
          onRouteInfoRef.current?.({
            distanceText: leg.distance?.text ?? '—',
            durationText: leg.duration?.text ?? '—',
            nextInstruction: step0 ? stripHtml(step0.instructions) : undefined,
          });
        } else {
          setDirections(null);
          setFallbackLine([pos, { lat: customerLat, lng: customerLng }]);
          onRouteInfoRef.current?.(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [routeRequestId, isLoaded, loadError, customerLat, customerLng]);

  useEffect(() => {
    if (!map || !directions?.routes[0]) return;
    const path = directions.routes[0].overview_path;
    if (!path || path.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }, [map, directions]);

  const center = useMemo((): google.maps.LatLngLiteral => {
    if (customerLat != null && customerLng != null) {
      return { lat: customerLat, lng: customerLng };
    }
    return { lat: 24.86, lng: 67.01 };
  }, [customerLat, customerLng]);

  const customerValid =
    customerLat != null && customerLng != null && Number.isFinite(customerLat) && Number.isFinite(customerLng);

  if (loadError) {
    return (
      <div className="map-view map-view--fallback">
        <MapViewContainer customerLat={customerLat} customerLng={customerLng} />
        <div className="map-banner map-banner--warn">Could not load Google Maps. Check API key and referrer restrictions.</div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-view map-view--loading">
        <span className="muted">Loading map…</span>
      </div>
    );
  }

  return (
    <div className="google-delivery-map">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        onLoad={setMap}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          disableDefaultUI: false,
        }}
      >
        {customerValid ? (
          <Marker
            position={{ lat: customerLat!, lng: customerLng! }}
            label={{ text: 'D', color: 'white', fontSize: '11px', fontWeight: 'bold' }}
            title="Drop-off"
          />
        ) : null}
        {riderMarker ? (
          <Marker
            position={riderMarker}
            label={{ text: 'R', color: 'white', fontSize: '11px', fontWeight: 'bold' }}
            title="You"
          />
        ) : null}
        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              preserveViewport: false,
              polylineOptions: {
                strokeColor: '#2563eb',
                strokeOpacity: 0.95,
                strokeWeight: 5,
              },
            }}
          />
        ) : null}
        {fallbackLine && fallbackLine.length >= 2 ? (
          <Polyline
            path={fallbackLine}
            options={{
              strokeColor: '#64748b',
              strokeOpacity: 0.85,
              strokeWeight: 4,
              geodesic: true,
            }}
          />
        ) : null}
      </GoogleMap>

      {geoWarn ? <div className="map-banner map-banner--warn map-banner--float">{geoWarn}</div> : null}
    </div>
  );
}

type Props = {
  customerLat: number | null;
  customerLng: number | null;
  onRouteInfo?: (info: RouteInfo | null) => void;
  onRiderPosition?: (pos: { lat: number; lng: number } | null) => void;
};

/** Renders Google map + directions when `VITE_GOOGLE_MAPS_API_KEY` is set; otherwise the lightweight placeholder. */
export function GoogleDeliveryMap(props: Props) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  if (!apiKey) {
    return (
      <div className="map-view map-view--fallback">
        <MapViewContainer customerLat={props.customerLat} customerLng={props.customerLng} />
        <div className="map-banner map-banner--muted">
          Add <code className="map-banner__code">VITE_GOOGLE_MAPS_API_KEY</code> for live route & ETA.
        </div>
      </div>
    );
  }
  return <GoogleDeliveryMapLoaded apiKey={apiKey} {...props} />;
}

export function openGoogleMapsTurnByTurn(
  customerLat: number,
  customerLng: number,
  rider: { lat: number; lng: number } | null
) {
  const dest = `${customerLat},${customerLng}`;
  const url = rider
    ? `https://www.google.com/maps/dir/?api=1&origin=${rider.lat},${rider.lng}&destination=${dest}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
