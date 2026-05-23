import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OfflineAction = {
  id: string;
  type: 'accept' | 'picked' | 'onTheWay' | 'arrived' | 'delivered' | 'failed' | 'location';
  orderId?: string;
  body?: Record<string, unknown>;
  createdAt: string;
  retries: number;
};

type OfflineState = {
  queue: OfflineAction[];
  cachedOrders: Record<string, unknown>;
  enqueue: (action: Omit<OfflineAction, 'id' | 'createdAt' | 'retries'>) => void;
  dequeue: (id: string) => void;
  setCachedOrders: (bucket: string, data: unknown) => void;
  getCachedOrders: (bucket: string) => unknown | null;
};

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      cachedOrders: {},
      enqueue: (action) =>
        set((s) => ({
          queue: [
            ...s.queue,
            {
              ...action,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
              retries: 0,
            },
          ],
        })),
      dequeue: (id) => set((s) => ({ queue: s.queue.filter((a) => a.id !== id) })),
      setCachedOrders: (bucket, data) =>
        set((s) => ({ cachedOrders: { ...s.cachedOrders, [bucket]: data } })),
      getCachedOrders: (bucket) => get().cachedOrders[bucket] ?? null,
    }),
    { name: 'rider_offline_v1' }
  )
);
