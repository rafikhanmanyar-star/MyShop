import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { orderCenterApi } from '../../../services/orderCenterApi';
import { useOrderCenter } from '../../../context/OrderCenterContext';

const DISPATCH_QUICK = [
  'Please confirm pickup',
  'Customer called — update address',
  'Delay at store — 10 min',
  'Reassign if needed',
];

type ChatMsg = {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
};

export function OrderCenterChat({ orderId, riderName }: { orderId: string; riderName?: string | null }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { subscribeDetailRefresh } = useOrderCenter();

  const load = useCallback(async () => {
    try {
      const res = await orderCenterApi.getChatMessages(orderId);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeDetailRefresh((p) => {
      if (p.source === 'chat_message' && p.orderId === orderId) void load();
    });
  }, [orderId, load, subscribeDetailRefresh]);

  const send = async (body: string) => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await orderCenterApi.sendChatMessage(orderId, body.trim());
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <MessageCircle className="w-4 h-4 text-primary-600" />
        <span className="text-sm font-bold">Rider chat</span>
        {riderName ? <span className="text-xs text-muted-foreground">· {riderName}</span> : null}
      </div>
      <div className="max-h-48 overflow-y-auto p-3 space-y-2 bg-white dark:bg-slate-950">
        {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
        {!loading && !messages.length ? (
          <p className="text-xs text-muted-foreground">No messages yet. Coordinate pickup or delivery issues here.</p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`text-sm ${m.sender_role === 'shop' ? 'text-right' : 'text-left'}`}
          >
            <span
              className={`inline-block px-3 py-1.5 rounded-xl max-w-[90%] ${
                m.sender_role === 'shop'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
              }`}
            >
              {m.body}
            </span>
            <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{m.sender_role}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        {DISPATCH_QUICK.map((q) => (
          <button
            key={q}
            type="button"
            className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
            onClick={() => void send(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="flex gap-2 p-3">
        <input
          className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message rider…"
          onKeyDown={(e) => e.key === 'Enter' && void send(text)}
        />
        <button
          type="button"
          className="btn btn-primary shrink-0 px-3"
          disabled={sending}
          onClick={() => void send(text)}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
