export const FEEDBACK_TYPES = [
    { key: 'product_request', label: 'Product Request' },
    { key: 'complaint', label: 'Complaint' },
    { key: 'suggestion', label: 'Suggestion' },
    { key: 'delivery_feedback', label: 'Delivery Feedback' },
    { key: 'app_feedback', label: 'App Feedback' },
    { key: 'feature_request', label: 'Feature Request' },
] as const;

export type FeedbackTypeKey = (typeof FEEDBACK_TYPES)[number]['key'];

type Props = {
    value: FeedbackTypeKey;
    onChange: (v: FeedbackTypeKey) => void;
};

export default function FeedbackTypeChips({ value, onChange }: Props) {
    return (
        <div className="fb-type-chips" role="tablist" aria-label="Feedback type">
            {FEEDBACK_TYPES.map((t) => (
                <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={value === t.key}
                    className={`filter-chip-btn fb-type-chip ${value === t.key ? 'active' : ''}`}
                    onClick={() => onChange(t.key)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}
