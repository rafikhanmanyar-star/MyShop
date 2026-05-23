/**
 * Backend-controlled mobile app version policy.
 * Configure via environment variables on deploy (Render, etc.).
 */

export type AppVersionPolicy = {
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  releaseNotes: string[];
  /** Android versionCode floor (optional extra gate for native builds). */
  minimumAndroidVersionCode?: number;
};

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

function parseSemver(version: string): [number, number, number] | null {
  const core = version.trim().split('-')[0].split('+')[0];
  const parts = core.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** Compare semver strings: -1 if a<b, 0 if equal, 1 if a>b */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function parseReleaseNotes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return trimmed
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveVersion(envKey: string, fallback: string): string {
  const v = process.env[envKey]?.trim();
  if (v && SEMVER_RE.test(v)) return v;
  if (v) console.warn(`[appVersion] Ignoring invalid ${envKey}: ${v}`);
  return fallback;
}

const DEFAULT_LATEST = '1.1.12';
const DEFAULT_MINIMUM = '1.0.0';

export function getAppVersionPolicy(): AppVersionPolicy {
  const latestVersion = resolveVersion('APP_LATEST_VERSION', DEFAULT_LATEST);
  const minimumSupportedVersion = resolveVersion('APP_MINIMUM_SUPPORTED_VERSION', DEFAULT_MINIMUM);

  // Never allow server to advertise a minimum above latest (misconfiguration guard).
  const safeMinimum =
    compareSemver(minimumSupportedVersion, latestVersion) > 0 ? latestVersion : minimumSupportedVersion;

  const forceEnv = process.env.APP_FORCE_UPDATE?.trim().toLowerCase();
  const forceUpdate = forceEnv === '1' || forceEnv === 'true' || forceEnv === 'yes';

  const releaseNotes = parseReleaseNotes(process.env.APP_RELEASE_NOTES);

  const minCodeRaw = process.env.APP_MINIMUM_ANDROID_VERSION_CODE?.trim();
  const minimumAndroidVersionCode = minCodeRaw ? parseInt(minCodeRaw, 10) : undefined;

  return {
    latestVersion,
    minimumSupportedVersion: safeMinimum,
    forceUpdate,
    releaseNotes:
      releaseNotes.length > 0
        ? releaseNotes
        : [
            'Performance improvements',
            'Bug fixes and stability',
          ],
    ...(Number.isFinite(minimumAndroidVersionCode) && minimumAndroidVersionCode! > 0
      ? { minimumAndroidVersionCode }
      : {}),
  };
}

export type VersionCheckInput = {
  currentVersion: string;
  currentBuild?: number;
};

export type VersionCheckResult = {
  updateAvailable: boolean;
  forceUpdateRequired: boolean;
  policy: AppVersionPolicy;
};

/**
 * Determines whether the client should update.
 * Rejects downgrade prompts: update only when current < latest.
 */
export function evaluateVersionCheck(input: VersionCheckInput): VersionCheckResult {
  const policy = getAppVersionPolicy();
  const { currentVersion, currentBuild } = input;

  const belowMinimum = compareSemver(currentVersion, policy.minimumSupportedVersion) < 0;
  const belowLatest = compareSemver(currentVersion, policy.latestVersion) < 0;

  let forceUpdateRequired = belowMinimum || policy.forceUpdate;
  if (
    policy.minimumAndroidVersionCode != null &&
    currentBuild != null &&
    currentBuild < policy.minimumAndroidVersionCode
  ) {
    forceUpdateRequired = true;
  }

  // Security: never suggest update if server latest is older than client (downgrade attack).
  const updateAvailable = belowLatest && compareSemver(policy.latestVersion, currentVersion) > 0;

  return {
    updateAvailable: updateAvailable || forceUpdateRequired,
    forceUpdateRequired,
    policy,
  };
}
