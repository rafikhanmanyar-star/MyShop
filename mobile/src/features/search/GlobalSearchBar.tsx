import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { SEARCH_PLACEHOLDER_ROTATION } from './searchPlaceholders';

type Props = {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    variant: 'home' | 'browse';
    autoFocus?: boolean;
    placeholderIndex?: number;
    /** When set, placeholder text does not rotate (home hero layout). */
    fixedPlaceholder?: string;
    /** Opens browse / scan flow (shown on home next to mic). */
    onBarcodeScan?: () => void;
    /** Renders below the field (e.g. suggestions). */
    overlay?: ReactNode;
    focused?: boolean;
    onFocusChange?: (f: boolean) => void;
};

export default function GlobalSearchBar({
    value,
    onChange,
    onSubmit,
    variant,
    autoFocus,
    fixedPlaceholder,
    onBarcodeScan,
    overlay,
    focused,
    onFocusChange,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [phIdx, setPhIdx] = useState(0);
    const [listening, setListening] = useState(false);

    useEffect(() => {
        if (fixedPlaceholder) return;
        const id = setInterval(() => setPhIdx((i) => (i + 1) % SEARCH_PLACEHOLDER_ROTATION.length), 3200);
        return () => clearInterval(id);
    }, [fixedPlaceholder]);

    const startVoice = () => {
        const SR = (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
        if (!SR) {
            alert('Voice search is not supported in this browser. Try Chrome.');
            return;
        }
        const rec = new SR();
        rec.lang = document.documentElement.lang || 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        setListening(true);
        rec.onresult = (ev: any) => {
            const t = ev.results[0]?.[0]?.transcript?.trim();
            if (t) onChange(t);
            setListening(false);
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        rec.start();
    };

    const wrapClass =
        variant === 'home'
            ? 'global-search global-search--home'
            : 'global-search global-search--browse';

    return (
        <div className={`${wrapClass} ${focused ? 'global-search--focused' : ''}`}>
            <form
                className="global-search__form"
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    onSubmit();
                }}
            >
                <svg className="global-search__icon" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="m21 21-4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                    ref={inputRef}
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus={autoFocus}
                    className="global-search__input"
                    placeholder={fixedPlaceholder ?? SEARCH_PLACEHOLDER_ROTATION[phIdx]}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => onFocusChange?.(true)}
                    onBlur={() => setTimeout(() => onFocusChange?.(false), 180)}
                />
                {value ? (
                    <button
                        type="button"
                        className="global-search__clear"
                        aria-label="Clear search"
                        onClick={() => {
                            onChange('');
                            inputRef.current?.focus();
                        }}
                    >
                        ×
                    </button>
                ) : null}
                <button
                    type="button"
                    className={`global-search__mic ${listening ? 'global-search__mic--active' : ''}`}
                    aria-label="Voice search"
                    onClick={() => startVoice()}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                        <path
                            fill="currentColor"
                            d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 1 1-10 0H5a7 7 0 0 0 6 6.92V20H7v2h10v-2h-4v-2.08A7 7 0 0 0 19 11h-2z"
                        />
                    </svg>
                </button>
                {variant === 'home' && onBarcodeScan ? (
                    <button type="button" className="global-search__scan" aria-label="Browse products" onClick={() => onBarcodeScan()}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                            <path
                                fill="currentColor"
                                d="M4 5a1 1 0 0 1 1-1h3v2H6v2H4V5zm16 0v3h-2V6h-2V4h3a1 1 0 0 1 1 1zm0 14a1 1 0 0 1-1 1h-3v-2h2v-2h2v3zM4 19v-3h2v2h2v2H5a1 1 0 0 1-1-1zm4-12h2v8H8V7zm4 0h4v2h-4V7zm0 4h6v2h-6v-2zm0 4h8v2h-8v-2z"
                            />
                        </svg>
                    </button>
                ) : null}
            </form>
            {overlay}
        </div>
    );
}
