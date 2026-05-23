/** All IANA time zones supported by the runtime (grouped for the settings picker). */
export function getIanaTimezones(): string[] {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    return [...Intl.supportedValuesOf('timeZone')].sort();
  }
  return [
    'UTC',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles',
  ];
}

export type TimezoneGroup = { region: string; zones: string[] };

export function groupIanaTimezones(zones: string[]): TimezoneGroup[] {
  const map = new Map<string, string[]>();
  for (const z of zones) {
    const slash = z.indexOf('/');
    const region = slash > 0 ? z.slice(0, slash) : 'Other';
    if (!map.has(region)) map.set(region, []);
    map.get(region)!.push(z);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, list]) => ({ region, zones: list }));
}

/** UTC offset label for an IANA zone, e.g. "UTC+05:00". */
export function formatTimezoneOffset(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (!raw) return '';
    // Normalize "GMT+5" / "GMT+05:00" → consistent UTC±HH:MM
    const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (m) {
      const sign = m[1];
      const h = m[2].padStart(2, '0');
      const min = (m[3] ?? '00').padStart(2, '0');
      return `UTC${sign}${h}:${min}`;
    }
    return raw.replace(/\s*GMT/i, 'UTC');
  } catch {
    return '';
  }
}

export function formatTimezoneLabel(tz: string, at: Date = new Date()): string {
  const offset = formatTimezoneOffset(tz, at);
  return offset ? `${tz} (${offset})` : tz;
}
