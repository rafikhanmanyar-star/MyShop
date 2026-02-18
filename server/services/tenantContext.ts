import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContextStore = {
  tenantId: string;
  userId?: string;
};

export const tenantContext = new AsyncLocalStorage<TenantContextStore>();

export function runWithTenantContext<T>(
  store: TenantContextStore,
  fn: () => T
): T {
  return tenantContext.run(store, fn);
}

export function getCurrentTenantId(): string | undefined {
  return tenantContext.getStore()?.tenantId;
}
