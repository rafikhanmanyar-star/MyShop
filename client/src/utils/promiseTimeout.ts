/**
 * Resolve with `fallback` if `promise` does not settle within `ms` milliseconds.
 */
export function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}
