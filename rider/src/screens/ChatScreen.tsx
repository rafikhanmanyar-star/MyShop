import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { riderApi } from '../api';
import { useRiderWork } from '../context/RiderWorkContext';

const QUICK_REPLIES = [
  'On my way',
  'Arrived at your location',
  'Please call me',
  'Running 5 min late',
];

export default function ChatScreen() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { deliveryFeedRevision } = useRiderWork();
  const qc = useQueryClient();

  const { data: threads } = useQuery({
    queryKey: ['chat-threads', deliveryFeedRevision],
    queryFn: () => riderApi.getChatThreads(),
  });

  const { data: messages } = useQuery({
    queryKey: ['chat-messages', orderId, deliveryFeedRevision],
    queryFn: () => riderApi.getChatMessages(orderId!),
    enabled: !!orderId,
    refetchInterval: orderId ? 8000 : false,
  });

  const send = async (body: string) => {
    if (!orderId || !body.trim()) return;
    setSending(true);
    try {
      await riderApi.sendChatMessage(orderId, body.trim());
      setText('');
      void qc.invalidateQueries({ queryKey: ['chat-messages', orderId] });
    } finally {
      setSending(false);
    }
  };

  if (!orderId) {
    return (
      <div className="r-page">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Messages</h2>
        <p style={{ color: 'var(--r-muted)' }}>Chat with dispatch and customers on active deliveries.</p>
        {(threads?.threads ?? []).map((t) => (
          <button
            key={t.order_id}
            type="button"
            className="r-queue-card"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => nav(`/chat/${t.order_id}`)}
          >
            <strong>#{t.order_number}</strong> · {t.customer_name}
            {t.last_message ? (
              <p style={{ margin: '6px 0 0', color: 'var(--r-muted)', fontSize: 14 }}>
                {(t as { last_sender_role?: string }).last_sender_role === 'customer' ? 'Customer: ' : ''}
                {t.last_message}
              </p>
            ) : null}
          </button>
        ))}
        {!threads?.threads?.length ? <p style={{ color: 'var(--r-muted)' }}>No active delivery chats</p> : null}
      </div>
    );
  }

  return (
    <div className="r-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '70dvh' }}>
      <button type="button" className="r-btn r-btn--ghost" style={{ width: 'auto' }} onClick={() => nav('/chat')}>
        ← Threads
      </button>
      <div style={{ flex: 1, overflow: 'auto', margin: '12px 0' }}>
        {(messages?.messages ?? []).map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 10,
              textAlign: m.sender_role === 'rider' ? 'right' : 'left',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: 14,
                background: m.sender_role === 'rider' ? 'var(--r-primary)' : 'var(--r-surface-2)',
                color: m.sender_role === 'rider' ? '#fff' : 'var(--r-text)',
                fontSize: 15,
              }}
            >
              {m.body}
            </span>
            <div style={{ fontSize: 11, color: 'var(--r-muted)', marginTop: 2 }}>
                {m.sender_role === 'customer' ? 'Customer' : m.sender_role === 'shop' ? 'Dispatch' : 'You'} ·{' '}
                {new Date(m.created_at).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {QUICK_REPLIES.map((q) => (
          <button key={q} type="button" className="r-tab" style={{ fontSize: 12 }} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="r-field__input"
          style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid var(--r-border)' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message dispatch or customer…"
        />
        <button type="button" className="r-btn r-btn--primary" style={{ width: 'auto', minWidth: 80 }} disabled={sending} onClick={() => void send(text)}>
          Send
        </button>
      </div>
    </div>
  );
}
