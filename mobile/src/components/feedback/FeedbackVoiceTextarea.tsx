import { useState } from 'react';
import { ensureMicrophoneForRecording } from '../../permissions/microphonePermission';

type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    maxAlternatives: 1;
    onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript?: string } } } }) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
};

type Props = {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
};

export default function FeedbackVoiceTextarea({ value, onChange, placeholder }: Props) {
    const [listening, setListening] = useState(false);

    const startVoice = async () => {
        const perm = await ensureMicrophoneForRecording();
        if (perm.status !== 'granted') return;

        const SR =
            (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ??
            (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
        if (!SR) return;

        const rec = new SR();
        rec.lang = document.documentElement.lang || 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        setListening(true);
        rec.onresult = (ev) => {
            const text = ev.results[0]?.[0]?.transcript?.trim();
            if (text) onChange(value ? `${value} ${text}` : text);
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        rec.start();
    };

    return (
        <div className="fb-textarea-wrap">
            <textarea
                className="fb-textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || 'Tell us your feedback…'}
                rows={4}
                maxLength={4000}
            />
            <button
                type="button"
                className={`fb-textarea-mic ${listening ? 'fb-textarea-mic--on' : ''}`}
                aria-label="Voice input"
                onClick={() => void startVoice()}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
            </button>
        </div>
    );
}
