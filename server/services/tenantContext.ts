import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Response } from 'express';

export type TenantContextStore = {
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

/**
 * Keep tenant AsyncLocalStorage active until the response is finished. Express
 * `next()` returns before an async route handler's first `await`. If
 * `runWithTenantContext` only wraps a synchronous `next()` call, the store can
 * end before `databaseService.query` runs, so `getCurrentTenantId()` is empty,
 * `set_config` is skipped, and PostgreSQL RLS returns no rows (e.g. empty
 * `shop_brands` on the mobile filter).
 */
export function runWithTenantContextThroughResponse(
  store: TenantContextStore,
  res: Response,
  next: NextFunction
): Promise<void> {
  return runWithTenantContext(store, () => {
    return new Promise<void>((resolve) => {
      const onDone = () => {
        res.removeListener('finish', onDone);
        res.removeListener('close', onDone);
        resolve();
      };
      res.once('finish', onDone);
      res.once('close', onDone);
      next();
    });
  });
}

export function getCurrentTenantId(): string | undefined {
  return tenantContext.getStore()?.tenantId;
}
