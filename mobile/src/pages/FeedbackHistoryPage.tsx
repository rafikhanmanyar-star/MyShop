import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { feedbackApi } from '../api';
import { FEEDBACK_TYPES } from '../components/feedback/FeedbackTypeChips';

type FeedbackStatus = 'submitted' | 'under_review' | 'responded' | 'resolved';

const STATUS_LABELS: Record<FeedbackStatus, string> = {
    submitted: 'Submitted',
    under_review: 'Under Review',
    responded: 'Responded',
    resolved: 'Resolved',
};

const STATUS_CLASS: Record<FeedbackStatus, string> = {
    submitted: 'fb-status--submitted',
    under_review: 'fb-status--review',
    responded: 'fb-status--responded',
    resolved: 'fb-status--resolved',
};

type FeedbackItem = {
    id: string;
    feedback_type: string;
    message: string;
    status: FeedbackStatus;
    priority: string;
    created_at: string;
    reply_count?: number;
    replies?: { author_type: string; author_name?: string; message: string; created_at: string }[];
    product_request?: { product_name?: string } | null;
};

function typeLabel(key: string) {
    return FEEDBACK_TYPES.find((t) => t.key === key)?.label || key;
}

export default function FeedbackHistoryPage() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state } = useApp();
    const base = shopSlug ? `/${shopSlug}` : '';
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detail, setDetail] = useState<FeedbackItem | null>(null);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`${base}/login?redirect=feedback/history`, { replace: true });
        }
    }, [state.isLoggedIn, navigate, base]);

    useEffect(() => {
        if (!state.isLoggedIn) return;
        setLoading(true);
        feedbackApi
            .list()
            .then((res: { items?: FeedbackItem[] }) => setItems(res.items || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [state.isLoggedIn]);

    const toggleExpand = async (id: string) => {
        if (expanded === id) {
            setExpanded(null);
            setDetail(null);
            return;
        }
        setExpanded(id);
        try {
            const item = await feedbackApi.get(id);
            setDetail(item);
        } catch {
            setDetail(null);
        }
    };

    if (!state.isLoggedIn) {
        return <div className="page fb-page fade-in"><p className="fb-loading">Redirecting…</p></div>;
    }

    return (
        <div className="page fb-page fb-history fade-in">
            <header className="fb-header">
                <Link to={`${base}/feedback`} className="fb-header__back" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </Link>
                <div className="fb-header__text">
                    <h1>My Feedback History</h1>
                    <p>Track responses and status</p>
                </div>
            </header>

            {loading ? (
                <p className="fb-loading">Loading…</p>
            ) : items.length === 0 ? (
                <div className="fb-empty">
                    <p>No feedback yet.</p>
                    <Link to={`${base}/feedback`} className="fb-submit-btn fb-submit-btn--inline">Send feedback</Link>
                </div>
            ) : (
                <div className="fb-timeline">
                    {items.map((item) => (
                        <article key={item.id} className="fb-timeline-card">
                            <button type="button" className="fb-timeline-card__head" onClick={() => void toggleExpand(item.id)}>
                                <div>
                                    <span className="fb-timeline-card__type">{typeLabel(item.feedback_type)}</span>
                                    <p className="fb-timeline-card__preview">
                                        {item.product_request?.product_name || item.message.slice(0, 80) || '—'}
                                    </p>
                                    <time className="fb-timeline-card__time">{new Date(item.created_at).toLocaleDateString()}</time>
                                </div>
                                <span className={`fb-status ${STATUS_CLASS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                            </button>
                            {expanded === item.id && detail?.id === item.id && (
                                <div className="fb-timeline-card__body">
                                    <p>{detail.message}</p>
                                    {(detail.replies || []).length > 0 && (
                                        <div className="fb-replies">
                                            <h4>Responses</h4>
                                            {detail.replies!.map((r, i) => (
                                                <div key={i} className={`fb-reply fb-reply--${r.author_type}`}>
                                                    <strong>{r.author_type === 'staff' ? r.author_name || 'Shop' : 'You'}</strong>
                                                    <p>{r.message}</p>
                                                    <time>{new Date(r.created_at).toLocaleString()}</time>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
