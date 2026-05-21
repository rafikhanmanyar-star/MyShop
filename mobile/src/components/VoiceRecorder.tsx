import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceRecorderResult = {
    blob: Blob;
    mimeType: string;
    durationSeconds: number;
    url: string;
};

type Props = {
    maxSeconds: number;
    minSeconds?: number;
    onRecordingReady: (result: VoiceRecorderResult | null) => void;
};

export default function VoiceRecorder({ maxSeconds, minSeconds = 2, onRecordingReady }: Props) {
    const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle');
    const [elapsed, setElapsed] = useState(0);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const mediaRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animRef = useRef<number>(0);
    const resultRef = useRef<VoiceRecorderResult | null>(null);
    /** Wall-clock seconds while recording — React `elapsed` in onstop is stale (closure). */
    const elapsedRef = useRef(0);
    const recordingStartedAtRef = useRef<number | null>(null);

    const stopTracks = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    };

    const drawWave = useCallback(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const bars = 32;
        const step = Math.floor(buf.length / bars);
        for (let i = 0; i < bars; i++) {
            const v = buf[i * step] / 255;
            const bh = Math.max(4, v * h * 0.9);
            const x = (i / bars) * w;
            const bw = w / bars - 2;
            ctx.fillStyle = 'var(--primary, #4f46e5)';
            ctx.fillRect(x, (h - bh) / 2, bw, bh);
        }
        animRef.current = requestAnimationFrame(drawWave);
    }, []);

    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current);
        cancelAnimationFrame(animRef.current);
        stopTracks();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const measureDurationFromUrl = (url: string): Promise<number> =>
        new Promise((resolve) => {
            const audio = new Audio();
            const done = (sec: number) => {
                audio.src = '';
                resolve(sec);
            };
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
                const d = audio.duration;
                done(Number.isFinite(d) && d > 0 ? d : 0);
            };
            audio.onerror = () => done(0);
            audio.src = url;
        });

    const pickMime = (): string => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        for (const t of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
        }
        return 'audio/webm';
    };

    const startRecording = async () => {
        try {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            resultRef.current = null;
            onRecordingReady(null);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mime = pickMime();
            const rec = new MediaRecorder(stream, { mimeType: mime });
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = () => {
                void (async () => {
                    const blob = new Blob(chunksRef.current, { type: mime });
                    const url = URL.createObjectURL(blob);
                    setPreviewUrl(url);

                    let dur = elapsedRef.current;
                    if (recordingStartedAtRef.current != null) {
                        const wallSec = (Date.now() - recordingStartedAtRef.current) / 1000;
                        dur = Math.max(dur, wallSec);
                    }
                    try {
                        const metaSec = await measureDurationFromUrl(url);
                        if (metaSec > 0) dur = Math.max(dur, metaSec);
                    } catch { /* use wall / tick duration */ }

                    dur = Math.round(dur * 10) / 10;
                    if (dur < 0.1 && blob.size > 0) dur = 1;

                    resultRef.current = { blob, mimeType: mime, durationSeconds: dur, url };
                    setElapsed(Math.max(0, Math.ceil(dur)));
                    setState('preview');
                    onRecordingReady(resultRef.current);
                    stopTracks();
                    recordingStartedAtRef.current = null;
                })();
            };
            mediaRef.current = rec;
            const ctx = new AudioContext();
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            analyserRef.current = analyser;
            rec.start(200);
            setState('recording');
            elapsedRef.current = 0;
            recordingStartedAtRef.current = Date.now();
            setElapsed(0);
            timerRef.current = setInterval(() => {
                const next = elapsedRef.current + 1;
                elapsedRef.current = next;
                setElapsed(next);
                if (next >= maxSeconds) {
                    stopRecording();
                }
            }, 1000);
            drawWave();
        } catch {
            alert('Microphone access is required for voice orders.');
        }
    };

    const pauseRecording = () => {
        if (mediaRef.current?.state === 'recording') {
            mediaRef.current.pause();
            setState('paused');
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRef.current?.state === 'paused') {
            mediaRef.current.resume();
            setState('recording');
            timerRef.current = setInterval(() => {
                const next = elapsedRef.current + 1;
                elapsedRef.current = next;
                setElapsed(next);
                if (next >= maxSeconds) stopRecording();
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        cancelAnimationFrame(animRef.current);
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    };

    const deleteRecording = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        resultRef.current = null;
        elapsedRef.current = 0;
        recordingStartedAtRef.current = null;
        setElapsed(0);
        setState('idle');
        onRecordingReady(null);
    };

    const remaining = maxSeconds - elapsed;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return (
        <div className="voice-recorder" style={{ padding: 16, borderRadius: 16, background: 'var(--surface-elevated, #f8fafc)', border: '1px solid var(--border-subtle)' }}>
            <canvas ref={canvasRef} width={320} height={48} style={{ width: '100%', height: 48, borderRadius: 8, marginBottom: 12, background: 'rgba(0,0,0,0.04)' }} />
            <div style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                {state === 'idle' ? '0:00' : fmt(elapsed)}
            </div>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {state === 'recording' ? `${remaining}s left · max ${fmt(maxSeconds)}` : `Min ${minSeconds}s · max ${fmt(maxSeconds)}`}
            </p>
            {state === 'preview' && previewUrl && (
                <audio controls src={previewUrl} style={{ width: '100%', marginBottom: 12 }} />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {state === 'idle' && (
                    <button type="button" className="btn btn-primary" onClick={() => void startRecording()}>
                        🎤 Record
                    </button>
                )}
                {state === 'recording' && (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={pauseRecording}>Pause</button>
                        <button type="button" className="btn btn-primary" onClick={stopRecording}>Stop</button>
                    </>
                )}
                {state === 'paused' && (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={resumeRecording}>Resume</button>
                        <button type="button" className="btn btn-primary" onClick={stopRecording}>Stop</button>
                    </>
                )}
                {state === 'preview' && (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={deleteRecording}>Delete</button>
                        <button type="button" className="btn btn-primary" onClick={() => void startRecording()}>Re-record</button>
                    </>
                )}
            </div>
        </div>
    );
}
