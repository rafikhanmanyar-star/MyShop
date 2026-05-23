/** Arabic / Urdu script detection for dual-language product names. */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const LATIN_SCRIPT_RE = /[A-Za-z0-9]/;

const NAME_SEPARATOR_RE = /\s*[\/|·–—]\s*|\s+-\s+/;

export type SplitProductName = {
  /** English / Latin primary line (Inter Medium) */
  primary: string;
  /** Urdu / Arabic secondary line (Noto Sans Arabic), if present */
  secondary: string | null;
  /** True when the entire name is Urdu/Arabic script */
  allUrdu: boolean;
};

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

function cleanPart(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Split a product name into Latin primary + Urdu secondary lines.
 * Handles "English / اردو", mixed runs, and all-Urdu names.
 */
export function splitProductName(raw: string): SplitProductName {
  const name = cleanPart(raw);
  if (!name) return { primary: '', secondary: null, allUrdu: false };

  const sepParts = name.split(NAME_SEPARATOR_RE).map(cleanPart).filter(Boolean);
  if (sepParts.length >= 2) {
    const latinParts = sepParts.filter((p) => LATIN_SCRIPT_RE.test(p) && !hasArabicScript(p));
    const arabicParts = sepParts.filter((p) => hasArabicScript(p));
    if (latinParts.length && arabicParts.length) {
      return {
        primary: latinParts.join(' · '),
        secondary: arabicParts.join(' · '),
        allUrdu: false,
      };
    }
  }

  const runs: { text: string; arabic: boolean }[] = [];
  let buf = '';
  let bufArabic: boolean | null = null;

  for (const ch of name) {
    const isArabic = ARABIC_SCRIPT_RE.test(ch);
    const isLatin = LATIN_SCRIPT_RE.test(ch);
    if (!isArabic && !isLatin) {
      buf += ch;
      continue;
    }
    const arabic = isArabic;
    if (bufArabic === null) {
      bufArabic = arabic;
      buf = ch;
      continue;
    }
    if (bufArabic === arabic) {
      buf += ch;
    } else {
      if (buf.trim()) runs.push({ text: cleanPart(buf), arabic: bufArabic });
      buf = ch;
      bufArabic = arabic;
    }
  }
  if (buf.trim() && bufArabic != null) runs.push({ text: cleanPart(buf), arabic: bufArabic });

  const latin = runs.filter((r) => !r.arabic).map((r) => r.text);
  const arabic = runs.filter((r) => r.arabic).map((r) => r.text);

  if (latin.length && arabic.length) {
    return {
      primary: latin.join(' '),
      secondary: arabic.join(' '),
      allUrdu: false,
    };
  }

  if (arabic.length && !latin.length) {
    return { primary: name, secondary: null, allUrdu: true };
  }

  return { primary: name, secondary: null, allUrdu: false };
}
