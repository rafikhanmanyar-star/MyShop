import { useEffect, useRef, useState } from 'react';
import { riderApi } from '../api';
import { useRiderWork } from '../context/RiderWorkContext';

const MIN_SEND_INTERVAL_MS = 22_000;

/**
 * Stage 7: while the rider is AVAILABLE or BUSY, push GPS to the server for assignment + ETA distance.
 */
export function useRiderGeolocation() {
  const { profile } = useRiderWork();
  const lastSentAt = useRef(0);
  const watchId = useRef<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const shouldTrack = profile?.status === 'AVAILABLE' || profile?.status === 'BUSY';

  useEffect(() => {
    if (!shouldTrack) {
      if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setGeoError(null);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Location is not supported on this device.');
      return;
    }

    setGeoError(null);
    lastSentAt.current = 0;

    const send = (lat: number, lng: number) => {
      const now = Date.now();
      if (lastSentAt.current !== 0 && now - lastSentAt.current < MIN_SEND_INTERVAL_MS) return;
      lastSentAt.current = now;
      riderApi.postLocation({ latitude: lat, longitude: lng }).catch(() => {
        /* non-fatal; next tick will retry */
      });
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        send(pos.coords.latitude, pos.coords.longitude);
      },
      (err: GeolocationPositionError) => {
        if (err.code === 1) {
          setGeoError('Location permission denied. Enable it in browser settings to go online.');
        } else if (err.code === 2) {
          setGeoError('Location unavailable. Check GPS and try again.');
        } else {
          setGeoError('Could not read location.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 }
    );

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [shouldTrack]);

  return { geoError };
}
