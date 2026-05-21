/**
 * Pluggable speech-to-text for voice orders.
 * Providers: none | openai_whisper | google | azure | local_whisper
 */

export type TranscriptionProvider = 'none' | 'openai_whisper' | 'google' | 'azure' | 'local_whisper';

export interface TranscriptionItem {
    name: string;
    quantity: number;
    unit?: string;
}

export interface TranscriptionResult {
    text: string;
    items: TranscriptionItem[];
    provider: TranscriptionProvider;
}

function parseItemsFromText(text: string): TranscriptionItem[] {
    const items: TranscriptionItem[] = [];
    const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
        const m = line.match(/^(\d+(?:\.\d+)?)\s*(?:x\s*)?(.+)$/i)
            || line.match(/^(.+?)\s*x\s*(\d+(?:\.\d+)?)$/i);
        if (m) {
            const qty = parseFloat(m[1]);
            const name = (m[2] || m[1]).trim();
            if (name && Number.isFinite(qty)) {
                items.push({ name, quantity: qty });
                continue;
            }
        }
        if (line.length > 1) items.push({ name: line, quantity: 1 });
    }
    return items.slice(0, 50);
}

export async function transcribeVoiceAudio(
    provider: TranscriptionProvider,
    apiKey: string | null | undefined,
    audioBuffer: Buffer,
    mimeType: string
): Promise<TranscriptionResult | null> {
    if (!provider || provider === 'none') return null;

    if (provider === 'openai_whisper') {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) return null;
        const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
            : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'webm';
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`);
        form.append('model', 'whisper-1');
        form.append('language', 'en');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
        });
        if (!res.ok) {
            console.warn('Whisper transcription failed:', await res.text().catch(() => ''));
            return null;
        }
        const data = (await res.json()) as { text?: string };
        const text = String(data.text || '').trim();
        return { text, items: parseItemsFromText(text), provider: 'openai_whisper' };
    }

    // Other providers: stub for future integration
    console.warn(`Transcription provider "${provider}" not configured; skipping.`);
    return null;
}
