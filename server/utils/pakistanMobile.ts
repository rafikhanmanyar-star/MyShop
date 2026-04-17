/** Keep in sync with client/src/utils/pakistanMobile.ts and mobile/src/utils/pakistanMobile.ts */
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
        'Enter your 11-digit mobile number starting with 03 (e.g. 0300 1234567). Numbers starting with 92 or 3 are also accepted.',
    };
  }
  return { ok: true, digits: n };
}

/** E.164 storage form for Pakistan mobile: +923XXXXXXXXX (from 12-digit 92… string). */
export function pakistanMobileDigitsToE164(digits: string): string {
  const d = (digits || '').replace(/\D/g, '');
  if (!PK_MOBILE_92_DIGITS_REGEX.test(d)) {
    throw new Error('Invalid Pakistan mobile digits');
  }
  return `+${d}`;
}

/** Parse flexible input to a single E.164 value for DB, or null. */
export function normalizePakistanPhoneForStorage(raw: string): string | null {
  const p = parsePakistanMobile(raw);
  if (!p.ok) return null;
  return pakistanMobileDigitsToE164(p.digits);
}
