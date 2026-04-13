/** Keep in sync with client/src/utils/pakistanMobile.ts */
/** Pakistan mobile stored as digits only: country code 92 + 10 digits (12 characters total). */
export const PK_MOBILE_92_DIGITS_REGEX = /^92\d{10}$/;

function digitsOnly(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

/**
 * Normalize common local / partial inputs to 92 + 10 digits.
 * Accepts: 923********* | 03********* | 3********* (+spaces/dashes)
 */
export function normalizePakistanMobileTo92Digits(raw: string): string | null {
    const d = digitsOnly(raw);
    if (d.length === 12 && d.startsWith('92')) return d;
    if (d.length === 11 && d.startsWith('0')) return `92${d.slice(1)}`;
    if (d.length === 10 && d.startsWith('3')) return `92${d}`;
    return null;
}

export function parsePakistanMobile(raw: string):
    | { ok: true; digits: string }
    | { ok: false; message: string } {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
        return { ok: false, message: 'Phone number is required.' };
    }
    const n = normalizePakistanMobileTo92Digits(trimmed);
    if (!n || !PK_MOBILE_92_DIGITS_REGEX.test(n)) {
        return {
            ok: false,
            message:
                'Use 12 digits: 92 and 10 digits (e.g. 923*********). Local numbers starting with 0 are adjusted automatically.',
        };
    }
    return { ok: true, digits: n };
}
