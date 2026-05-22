import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, Download, RotateCcw } from 'lucide-react';

function formatElapsed(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function isAtEnd(audio: HTMLAudioElement): boolean {
    if (audio.ended) return true;
    const d = audio.duration;
    return Number.isFinite(d) && d > 0 && audio.currentTime >= d - 0.05;
}

export function VoiceAudioPlayer({ src, duration }: { src: string; duration?: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const ignorePauseRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(1);
    const [progress, setProgress] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [loadedDuration, setLoadedDuration] = useState<number | null>(null);
    const [vol, setVol] = useState(1);
    const [error, setError] = useState<string | null>(null);

    const effectiveDuration = useCallback((): number | null => {
        const a = audioRef.current;
        if (a && Number.isFinite(a.duration) && a.duration > 0) return a.duration;
        if (loadedDuration != null && loadedDuration > 0) return loadedDuration;
        if (duration != null && duration > 0) return duration;
        return null;
    }, [duration, loadedDuration]);

    const syncProgress = useCallback(() => {
        const a = audioRef.current;
        if (!a) return;
        const t = a.currentTime;
        setElapsed(t);
        const d = effectiveDuration();
        if (d && d > 0) {
            setProgress(Math.min(100, (t / d) * 100));
        }
    }, [effectiveDuration]);

    const stopProgressLoop = useCallback(() => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const startProgressLoop = useCallback(() => {
        stopProgressLoop();
        const tick = () => {
            syncProgress();
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [stopProgressLoop, syncProgress]);

    const rewindToStart = useCallback((audio: HTMLAudioElement) => {
        ignorePauseRef.current = true;
        audio.pause();
        audio.currentTime = 0;
        setProgress(0);
        setElapsed(0);
        ignorePauseRef.current = false;
    }, []);

    const playFromStart = useCallback(async () => {
        const a = audioRef.current;
        if (!a) return;

        setError(null);
        if (isAtEnd(a)) rewindToStart(a);

        try {
            await a.play();
            setPlaying(true);
            syncProgress();
            startProgressLoop();
            return;
        } catch {
            /* fall through to reload */
        }

        try {
            ignorePauseRef.current = true;
            a.load();
            a.currentTime = 0;
            ignorePauseRef.current = false;
            await a.play();
            setPlaying(true);
            syncProgress();
            startProgressLoop();
        } catch {
            stopProgressLoop();
            setPlaying(false);
            setError('Could not play recording. Try Download, then open the file.');
        }
    }, [rewindToStart, syncProgress, startProgressLoop, stopProgressLoop]);

    const pausePlayback = useCallback(() => {
        const a = audioRef.current;
        if (!a) return;
        stopProgressLoop();
        syncProgress();
        a.pause();
        setPlaying(false);
    }, [stopProgressLoop, syncProgress]);

    const toggle = () => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused || isAtEnd(a)) void playFromStart();
        else pausePlayback();
    };

    const replay = () => {
        const a = audioRef.current;
        if (!a) return;
        rewindToStart(a);
        void playFromStart();
    };

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        a.playbackRate = rate;
        a.volume = vol;
    }, [rate, vol]);

    useEffect(() => {
        stopProgressLoop();
        setPlaying(false);
        setProgress(0);
        setElapsed(0);
        setLoadedDuration(null);
        setError(null);
        const a = audioRef.current;
        if (a) {
            ignorePauseRef.current = true;
            a.pause();
            a.currentTime = 0;
            a.load();
            ignorePauseRef.current = false;
        }
    }, [src, stopProgressLoop]);

    useEffect(() => () => stopProgressLoop(), [stopProgressLoop]);

    const totalSeconds = loadedDuration ?? (duration && duration > 0 ? duration : null);
    const totalLabel = totalSeconds ? formatElapsed(totalSeconds) : '';

    return (
        <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 p-4 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/40 dark:to-slate-900 shadow-sm">
            <audio
                ref={audioRef}
                src={src}
                preload="auto"
                playsInline
                onPlay={() => {
                    setPlaying(true);
                    syncProgress();
                    startProgressLoop();
                }}
                onPause={() => {
                    if (ignorePauseRef.current) return;
                    stopProgressLoop();
                    syncProgress();
                    setPlaying(false);
                }}
                onTimeUpdate={syncProgress}
                onDurationChange={() => {
                    const a = audioRef.current;
                    if (a && Number.isFinite(a.duration) && a.duration > 0) {
                        setLoadedDuration(a.duration);
                        syncProgress();
                    }
                }}
                onLoadedMetadata={() => {
                    const a = audioRef.current;
                    if (a && Number.isFinite(a.duration) && a.duration > 0) {
                        setLoadedDuration(a.duration);
                    }
                    syncProgress();
                }}
                onEnded={() => {
                    stopProgressLoop();
                    const a = audioRef.current;
                    if (a) rewindToStart(a);
                    setPlaying(false);
                }}
                onError={() =>
                    setError(
                        'Recording file not found on the server. With local dev + cloud database, restart the API after setting REMOTE_UPLOADS_ORIGIN in server/.env, or ask the customer to send a new voice order.'
                    )
                }
            />
            <div className="flex items-center gap-3 mb-3">
                <button
                    type="button"
                    onClick={toggle}
                    className="p-3 rounded-full bg-violet-600 text-white shadow-md hover:bg-violet-700 transition-colors"
                    title={playing ? 'Pause' : 'Play'}
                    aria-label={playing ? 'Pause voice recording' : 'Play voice recording'}
                >
                    {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                </button>
                <button
                    type="button"
                    onClick={replay}
                    className="p-2.5 rounded-full border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors"
                    title="Replay from start"
                    aria-label="Replay voice recording"
                >
                    <RotateCcw size={18} />
                </button>
                <div className="flex-1 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-violet-500"
                        style={{ width: `${progress}%`, transition: 'none' }}
                    />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums font-medium min-w-[4.5rem] text-right">
                    {formatElapsed(elapsed)}
                    {totalLabel ? ` / ${totalLabel}` : ''}
                </span>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
            <div className="flex flex-wrap gap-2 items-center text-xs">
                {[1, 1.5, 2].map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                            rate === r ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                        onClick={() => setRate(r)}
                    >
                        {r}x
                    </button>
                ))}
                <Volume2 size={14} className="ml-1 text-muted-foreground" aria-hidden />
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={vol}
                    onChange={(e) => setVol(parseFloat(e.target.value))}
                    className="w-24 accent-violet-600"
                    aria-label="Volume"
                />
                <a href={src} download className="ml-auto flex items-center gap-1 text-violet-600 hover:underline font-medium">
                    <Download size={14} /> Download
                </a>
            </div>
        </div>
    );
}
