import { getApiBaseUrl } from '../../api';
import { compareSemver } from './versionUtils';

export type AppVersionPolicyResponse = {
    latestVersion: string;
    minimumSupportedVersion: string;
    forceUpdate: boolean;
    releaseNotes: string[];
    minimumAndroidVersionCode?: number;
    updateAvailable?: boolean;
    forceUpdateRequired?: boolean;
};

export type VersionCheckResult = {
    policy: AppVersionPolicyResponse;
    updateAvailable: boolean;
    forceUpdateRequired: boolean;
    /** Server latest is newer than client (no downgrade prompts). */
    newerVersionAvailable: boolean;
};

const CHECK_TIMEOUT_MS = 8000;
const LATER_STORAGE_KEY = 'myshop_update_prompt_dismissed_at';
const LATER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal, credentials: 'omit' });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Lightweight backend version check. Public endpoint — no auth required.
 */
export async function fetchVersionPolicy(
    currentVersion: string,
    currentBuild?: number
): Promise<VersionCheckResult> {
    const base = getApiBaseUrl().replace(/\/$/, '');
    const params = new URLSearchParams({ currentVersion });
    if (currentBuild != null) params.set('build', String(currentBuild));

    const res = await fetchWithTimeout(`${base}/app-version?${params}`, CHECK_TIMEOUT_MS);
    if (!res.ok) {
        throw new Error(res.status === 400 ? 'Invalid version' : 'Version check failed');
    }

    const policy = (await res.json()) as AppVersionPolicyResponse;

    const belowMinimum = compareSemver(currentVersion, policy.minimumSupportedVersion) < 0;
    const belowLatest = compareSemver(currentVersion, policy.latestVersion) < 0;
    const newerVersionAvailable = compareSemver(policy.latestVersion, currentVersion) > 0;

    let forceUpdateRequired =
        policy.forceUpdateRequired === true ||
        belowMinimum ||
        policy.forceUpdate === true;

    if (
        policy.minimumAndroidVersionCode != null &&
        currentBuild != null &&
        currentBuild < policy.minimumAndroidVersionCode
    ) {
        forceUpdateRequired = true;
    }

    // Security: only treat as update when server latest is strictly greater than client.
    const updateAvailable =
        (policy.updateAvailable === true || belowLatest || forceUpdateRequired) && newerVersionAvailable;

    return {
        policy,
        updateAvailable: updateAvailable || forceUpdateRequired,
        forceUpdateRequired,
        newerVersionAvailable,
    };
}

export function wasUpdatePromptDismissedRecently(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(LATER_STORAGE_KEY);
        if (!raw) return false;
        const at = parseInt(raw, 10);
        return Number.isFinite(at) && Date.now() - at < LATER_COOLDOWN_MS;
    } catch {
        return false;
    }
}

export function markUpdatePromptDismissed(): void {
    try {
        localStorage.setItem(LATER_STORAGE_KEY, String(Date.now()));
    } catch {
        /* ignore */
    }
}

export function clearUpdatePromptDismissed(): void {
    try {
        localStorage.removeItem(LATER_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
