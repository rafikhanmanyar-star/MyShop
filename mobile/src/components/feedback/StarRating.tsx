type Props = {
    value: number;
    onChange: (v: number) => void;
    size?: 'sm' | 'md';
    label?: string;
};

export default function StarRating({ value, onChange, size = 'md', label }: Props) {
    const sz = size === 'sm' ? 22 : 28;
    return (
        <div className="fb-star-row">
            {label ? <span className="fb-star-row__label">{label}</span> : null}
            <div className="fb-star-row__stars" role="group" aria-label={label || 'Rating'}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        className={`fb-star-btn ${n <= value ? 'fb-star-btn--on' : ''}`}
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        aria-pressed={n <= value}
                        onClick={() => onChange(n === value ? 0 : n)}
                    >
                        <svg width={sz} height={sz} viewBox="0 0 24 24" aria-hidden>
                            <path
                                d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                ))}
            </div>
        </div>
    );
}
