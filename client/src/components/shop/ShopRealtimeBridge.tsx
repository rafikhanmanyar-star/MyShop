import { useEffect } from 'react';
import { getApiBaseUrl } from '../../config/apiUrl';

/**
 * Subscribes to `/shop/realtime/stream` (PostgreSQL NOTIFY) and dispatches
 * `shop:realtime` on the window for inventory/dashboard refresh when returns land.
 */
export default function ShopRealtimeBridge() {
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const url = `${getApiBaseUrl()}/shop/realtime/stream`;
    const controller = new AbortController();

    const connect = () => {
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok || !response.body) return;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const process = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const payload = JSON.parse(line.slice(6));
                      if (
                        payload.type === 'daily_report_updated' ||
                        payload.type === 'sales_return_created'
                      ) {
                        window.dispatchEvent(new CustomEvent('shop:realtime', { detail: payload }));
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }
            } catch {
              setTimeout(connect, 5000);
            }
          };
          process();
        })
        .catch(() => {
          setTimeout(connect, 5000);
        });
    };

    connect();
    return () => controller.abort();
  }, []);

  return null;
}
