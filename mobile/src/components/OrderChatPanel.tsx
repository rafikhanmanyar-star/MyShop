import { useCallback, useEffect, useRef, useState } from 'react';
import { customerApi } from '../api';

const QUICK_REPLIES = [
    "Where's my order?",
    'Please call me',
    'Update my address',
    'Leave at the door',
];

export type ChatMessage = {
    id: string;
    sender_role: 'rider' | 'shop' | 'customer';
    body: string;
    created_at: string;
};

function senderLabel(role: string): string {
    if (role === 'rider') return 'Rider';
    if (role === 'shop') return 'Shop';
    if (role === 'customer') return 'You';
    return role;
}

type Props = {
    orderId: string;
    disabled?: boolean;
    refreshToken?: number;
    onNewMessage?: () => void;
};

export function OrderChatPanel({ orderId, disabled, refreshToken = 0, onNewMessage }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await customerApi.getChatMessages(orderId);
            setMessages(res.messages);
            setErr('');
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Could not load messages');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        void load();
    }, [load, refreshToken]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const send = async (body: string) => {
        if (disabled || !body.trim()) return;
        setSending(true);
        setErr('');
        try {
            await customerApi.sendChatMessage(orderId, body.trim());
            setText('');
            await load();
            onNewMessage?.();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Send failed');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            style={{
                background: 'white',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: 16,
            }}
        >
            <div
                style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-light)',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                }}
            >
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#1e40af' }}>
                    💬 Chat with rider & shop
                </h3>
                <p style={{ fontSize: 12, color: '#3b82f6', margin: '4px 0 0' }}>
                    Ask about delivery, address, or timing
                </p>
            </div>

            <div
                style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    padding: 12,
                    background: '#f8fafc',
                }}
            >
                {loading ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p> : null}
                {!loading && !messages.length ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                        No messages yet. Say hello or ask a question.
                    </p>
                ) : null}
                {messages.map((m) => {
                    const mine = m.sender_role === 'customer';
                    return (
                        <div
                            key={m.id}
                            style={{
                                marginBottom: 10,
                                textAlign: mine ? 'right' : 'left',
                            }}
                        >
                            <div
                                style={{
                                    display: 'inline-block',
                                    maxWidth: '88%',
                                    padding: '10px 12px',
                                    borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                    background: mine ? 'var(--primary)' : 'white',
                                    color: mine ? 'white' : 'var(--text-primary)',
                                    border: mine ? 'none' : '1px solid var(--border-light)',
                                    fontSize: 14,
                                    lineHeight: 1.4,
                                }}
                            >
                                {m.body}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                {senderLabel(m.sender_role)} ·{' '}
                                {new Date(m.created_at).toLocaleTimeString('en-PK', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {!disabled ? (
                <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px 0' }}>
                        {QUICK_REPLIES.map((q) => (
                            <button
                                key={q}
                                type="button"
                                onClick={() => void send(q)}
                                disabled={sending}
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '1px solid var(--border-light)',
                                    background: 'white',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Type a message…"
                            disabled={sending}
                            onKeyDown={(e) => e.key === 'Enter' && void send(text)}
                            style={{
                                flex: 1,
                                padding: '12px 14px',
                                borderRadius: 12,
                                border: '1px solid var(--border-light)',
                                fontSize: 15,
                            }}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={sending || !text.trim()}
                            onClick={() => void send(text)}
                            style={{ minWidth: 72, padding: '12px 16px' }}
                        >
                            {sending ? '…' : 'Send'}
                        </button>
                    </div>
                </>
            ) : (
                <p style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                    Chat is closed for this order.
                </p>
            )}
            {err ? <p style={{ padding: '0 12px 12px', fontSize: 12, color: '#dc2626' }}>{err}</p> : null}
        </div>
    );
}
