import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { feedbackApi, publicApi } from '../api';
import FeedbackTypeChips, { type FeedbackTypeKey } from '../components/feedback/FeedbackTypeChips';
import StarRating from '../components/feedback/StarRating';
import FeedbackVoiceTextarea from '../components/feedback/FeedbackVoiceTextarea';
import ProductRequestFields from '../components/feedback/ProductRequestFields';
import ImageAttachments, { type FeedbackAttachmentItem } from '../components/feedback/ImageAttachments';

const EMPTY_PRODUCT = { productName: '', brand: '', category: '', notes: '', barcode: '' };

export default function FeedbackPage() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const base = shopSlug ? `/${shopSlug}` : '';

    const [feedbackType, setFeedbackType] = useState<FeedbackTypeKey>('suggestion');
    const [message, setMessage] = useState('');
    const [overallRating, setOverallRating] = useState(0);
    const [deliveryRating, setDeliveryRating] = useState(0);
    const [productQualityRating, setProductQualityRating] = useState(0);
    const [productRequest, setProductRequest] = useState(EMPTY_PRODUCT);
    const [attachments, setAttachments] = useState<FeedbackAttachmentItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`${base}/login?redirect=feedback`, { replace: true });
        }
    }, [state.isLoggedIn, navigate, base]);

    useEffect(() => {
        if (!shopSlug) return;
        publicApi.getCategories(shopSlug).then((rows: { name?: string }[]) => {
            setCategories((rows || []).map((c) => c.name || '').filter(Boolean));
        }).catch(() => {});
    }, [shopSlug]);

    const uploadAttachments = async () => {
        const urls: string[] = [];
        for (const att of attachments) {
            if (att.url) {
                urls.push(att.url);
                continue;
            }
            if (att.file) {
                const res = await feedbackApi.uploadAttachment(att.file);
                urls.push(res.url);
            }
        }
        return urls;
    };

    const handleSubmit = async () => {
        if (feedbackType === 'product_request' && !productRequest.productName.trim()) {
            showToast('Please enter a product name');
            return;
        }
        if (feedbackType !== 'product_request' && !message.trim()) {
            showToast('Please enter your feedback');
            return;
        }

        setSubmitting(true);
        try {
            const attachmentUrls = await uploadAttachments();
            await feedbackApi.submit({
                feedbackType,
                message,
                overallRating: overallRating || undefined,
                deliveryRating: deliveryRating || undefined,
                productQualityRating: productQualityRating || undefined,
                productRequest: feedbackType === 'product_request' ? productRequest : undefined,
                attachmentUrls,
            });
            showToast('Feedback sent — thank you!');
            navigate(`${base}/feedback/history`);
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Could not send feedback');
        } finally {
            setSubmitting(false);
        }
    };

    if (!state.isLoggedIn) {
        return <div className="page fb-page fade-in"><p className="fb-loading">Redirecting…</p></div>;
    }

    return (
        <div className="page fb-page fade-in">
            <header className="fb-header">
                <Link to={`${base}/utilities`} className="fb-header__back" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </Link>
                <div className="fb-header__text">
                    <h1>Feedback & Suggestions</h1>
                    <p>Help us improve your experience</p>
                </div>
                <Link to={`${base}/feedback/history`} className="fb-header__action">My Feedback History</Link>
            </header>

            <FeedbackTypeChips value={feedbackType} onChange={setFeedbackType} />

            <section className="fb-card fb-ratings">
                <h3 className="fb-card__title">Ratings</h3>
                <StarRating label="Overall" value={overallRating} onChange={setOverallRating} size="sm" />
                <StarRating label="Delivery" value={deliveryRating} onChange={setDeliveryRating} size="sm" />
                <StarRating label="Product quality" value={productQualityRating} onChange={setProductQualityRating} size="sm" />
            </section>

            <section className="fb-card">
                <h3 className="fb-card__title">Your feedback</h3>
                <FeedbackVoiceTextarea value={message} onChange={setMessage} />
            </section>

            {feedbackType === 'product_request' && (
                <ProductRequestFields value={productRequest} onChange={setProductRequest} categories={categories} />
            )}

            <ImageAttachments items={attachments} onChange={setAttachments} />

            <div className="fb-sticky-submit">
                <button type="button" className="fb-submit-btn" disabled={submitting} onClick={() => void handleSubmit()}>
                    {submitting ? 'Sending…' : 'Send Feedback'}
                </button>
            </div>
        </div>
    );
}
