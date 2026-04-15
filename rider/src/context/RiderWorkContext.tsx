import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getRiderStreamUrl, riderApi, type RiderProfile } from '../api';
import { useRider } from './RiderContext';

type NewOrderPopup = {
  orderId: string;
  orderNumber: string;
  distanceKm: number | null;
};

type Ctx = {
  profile: RiderProfile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  online: boolean;
  setOnline: (next: boolean) => Promise<void>;
  onlineBusy: boolean;
  /** Increments when SSE signals an order update (dashboard should refetch lists). */
  deliveryFeedRevision: number;
  bumpDeliveryFeed: () => void;
  newOrderPopup: NewOrderPopup | null;
  dismissNewOrderPopup: () => void;
};

const RiderWorkContext = createContext<Ctx | null>(null);

export function RiderWorkProvider({ children }: { children: React.ReactNode }) {
  const { token, riderId } = useRider();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [deliveryFeedRevision, setDeliveryFeedRevision] = useState(0);

  const [newOrderPopup, setNewOrderPopup] = useState<NewOrderPopup | null>(null);
  const seenDeliveryIdsRef = useRef<Set<string>>(new Set());

  const bumpDeliveryFeed = useCallback(() => {
    setDeliveryFeedRevision((r) => r + 1);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    try {
      setProfileLoading(true);
      const p = await riderApi.getMe();
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [token]);

  const online = profile?.status === 'AVAILABLE' || profile?.status === 'BUSY';

  const setOnline = useCallback(
    async (next: boolean) => {
      setOnlineBusy(true);
      try {
        await riderApi.postStatus({ status: next ? 'AVAILABLE' : 'OFFLINE' });
        await refreshProfile();
      } finally {
        setOnlineBusy(false);
      }
    },
    [refreshProfile]
  );

  const dismissNewOrderPopup = useCallback(() => setNewOrderPopup(null), []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!token) {
      seenDeliveryIdsRef.current = new Set();
      return;
    }
    riderApi
      .getOrders({ bucket: 'assigned', limit: 50, offset: 0 })
      .then((res) => {
        for (const o of res.orders) {
          if (o.delivery_status === 'ASSIGNED' && !o.accepted_at) {
            seenDeliveryIdsRef.current.add(o.delivery_order_id);
          }
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [token]);

  useEffect(() => {
    const url = getRiderStreamUrl();
    if (!token || !url.includes('access_token=')) return;

    const es = new EventSource(url);
    es.onmessage = async (ev) => {
      try {
        const d = JSON.parse(ev.data) as {
          type?: string;
          source?: string;
          orderId?: string;
          riderId?: string;
        };
        if (d.type !== 'order_updated') return;

        const isNewAssign = d.source === 'delivery_insert' && d.orderId && d.riderId === riderId;

        await refreshProfile();
        bumpDeliveryFeed();

        if (isNewAssign && d.orderId) {
          try {
            const detail = (await riderApi.getOrder(d.orderId)) as {
              delivery_order_id?: string;
              order_number?: string;
              distance_km?: number | null;
              delivery_status?: string;
              accepted_at?: string | null;
            };
            const did = detail.delivery_order_id;
            if (
              did &&
              detail.delivery_status === 'ASSIGNED' &&
              !detail.accepted_at &&
              !seenDeliveryIdsRef.current.has(did)
            ) {
              seenDeliveryIdsRef.current.add(did);
              setNewOrderPopup({
                orderId: d.orderId,
                orderNumber: detail.order_number || d.orderId.slice(0, 8),
                distanceKm:
                  detail.distance_km != null && Number.isFinite(Number(detail.distance_km))
                    ? Number(detail.distance_km)
                    : null,
              });
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [token, riderId, refreshProfile, bumpDeliveryFeed]);

  const value = useMemo(
    () => ({
      profile,
      profileLoading,
      refreshProfile,
      online,
      setOnline,
      onlineBusy,
      deliveryFeedRevision,
      bumpDeliveryFeed,
      newOrderPopup,
      dismissNewOrderPopup,
    }),
    [
      profile,
      profileLoading,
      refreshProfile,
      online,
      setOnline,
      onlineBusy,
      deliveryFeedRevision,
      bumpDeliveryFeed,
      newOrderPopup,
      dismissNewOrderPopup,
    ]
  );

  return <RiderWorkContext.Provider value={value}>{children}</RiderWorkContext.Provider>;
}

export function useRiderWork() {
  const c = useContext(RiderWorkContext);
  if (!c) throw new Error('useRiderWork outside RiderWorkProvider');
  return c;
}
