import { useEffect, useRef, useState } from 'react';
import { riderApi } from '../api';
import { useRiderWork } from '../context/RiderWorkContext';
import { mapGeolocationError, probeRiderLocation } from '../permissions/locationPermission';
import { flushOfflineQueue } from '../lib/offlineSync';

const MIN_SEND_INTERVAL_MS = 5_000;
const MAX_RETRY_BACKOFF_MS = 30_000;

/**
 * While the rider is AVAILABLE or BUSY, push GPS to the server for assignment + ETA.
 * Optimized interval, network retry, and permission-aware errors.
 */
export function useRiderGeolocation() {
  const { profile } = useRiderWork();
  const lastSentAt = useRef(0);
  const watchId = useRef<number | null>(null);
  const retryBackoff = useRef(MIN_SEND_INTERVAL_MS);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [gpsDisabled, setGpsDisabled] = useState(false);

  const shouldTrack = profile?.status === 'AVAILABLE' || profile?.status === 'BUSY';

  useEffect(() => {
    if (!shouldTrack) {
      if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setGeoError(null);
      setGpsDisabled(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Location is not supported on this device.');
      return;
    }

    let cancelled = false;

    const startWatch = () => {
      setGeoError(null);
      setGpsDisabled(false);
      lastSentAt.current = 0;

      const send = (lat: number, lng: number) => {
        const now = Date.now();
        if (lastSentAt.current !== 0 && now - lastSentAt.current < MIN_SEND_INTERVAL_MS) return;
        lastSentAt.current = now;
        riderApi
          .postLocation({ latitude: lat, longitude: lng })
          .then(() => {
            retryBackoff.current = MIN_SEND_INTERVAL_MS;
            void flushOfflineQueue();
          })
          .catch(() => {
            retryBackoff.current = Math.min(retryBackoff.current * 2, MAX_RETRY_BACKOFF_MS);
          });
      };

      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          setGeoError(null);
          setGpsDisabled(false);
          send(pos.coords.latitude, pos.coords.longitude);
        },
        (err: GeolocationPositionError) => {
          if (cancelled) return;
          const mapped = mapGeolocationError(err);
          setGeoError(mapped.message);
          setGpsDisabled(mapped.gpsDisabled);
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 }
      );
    };

    void probeRiderLocation()
      .then(() => {
        if (!cancelled) startWatch();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Could not read location.';
        setGeoError(msg);
        setGpsDisabled(/GPS|unavailable/i.test(msg));
        startWatch();
      });

    return () => {
      cancelled = true;
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [shouldTrack]);

  return { geoError, gpsDisabled };
}
