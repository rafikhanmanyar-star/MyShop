const CORE_RE = /^(\d+)\.(\d+)\.(\d+)/;

export function parseSemverCore(version: string): [number, number, number] | null {
    const m = version.trim().match(CORE_RE);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/** -1 if a<b, 0 if equal, 1 if a>b */
export function compareSemver(a: string, b: string): number {
    const pa = parseSemverCore(a);
    const pb = parseSemverCore(b);
    if (!pa || !pb) return 0;
    for (let i = 0; i < 3; i++) {
        if (pa[i] < pb[i]) return -1;
        if (pa[i] > pb[i]) return 1;
    }
    return 0;
}

export function isValidSemver(version: string): boolean {
    return parseSemverCore(version) !== null;
}
