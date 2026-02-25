/**
 * Persist app context (organization + branch) for QR-selected branch and branch switch.
 * Stored in localStorage. Used before and after login so branch context survives.
 */

const KEY_ORG_ID = 'app_org_id';
const KEY_BRANCH_ID = 'app_branch_id';
const KEY_SELECTED_BY_QR = 'app_selected_by_qr';
const KEY_LAST_UPDATED = 'app_context_last_updated';

export interface AppContextValue {
  organization_id: string | null;
  branch_id: string | null;
  selected_by_qr: boolean;
  last_updated: string | null;
}

function getItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function setItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
}

function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

export function getAppContext(): AppContextValue {
  return {
    organization_id: getItem(KEY_ORG_ID),
    branch_id: getItem(KEY_BRANCH_ID),
    selected_by_qr: getItem(KEY_SELECTED_BY_QR) === 'true',
    last_updated: getItem(KEY_LAST_UPDATED),
  };
}

export function setAppContext(value: Partial<AppContextValue>): void {
  if (value.organization_id !== undefined) {
    if (value.organization_id == null) removeItem(KEY_ORG_ID);
    else setItem(KEY_ORG_ID, value.organization_id);
  }
  if (value.branch_id !== undefined) {
    if (value.branch_id == null) removeItem(KEY_BRANCH_ID);
    else setItem(KEY_BRANCH_ID, value.branch_id);
  }
  if (value.selected_by_qr !== undefined) {
    setItem(KEY_SELECTED_BY_QR, value.selected_by_qr ? 'true' : 'false');
  }
  setItem(KEY_LAST_UPDATED, new Date().toISOString());
}

export function clearAppContextBranch(): void {
  removeItem(KEY_BRANCH_ID);
  setItem(KEY_SELECTED_BY_QR, 'false');
  setItem(KEY_LAST_UPDATED, new Date().toISOString());
}

export function clearAppContext(): void {
  removeItem(KEY_ORG_ID);
  removeItem(KEY_BRANCH_ID);
  removeItem(KEY_SELECTED_BY_QR);
  removeItem(KEY_LAST_UPDATED);
}
