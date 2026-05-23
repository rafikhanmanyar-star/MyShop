/** Routes that need the full product/SKU catalog in memory (POS, inventory, etc.). */
const CATALOG_ROUTE_PREFIXES = [
  '/pos',
  '/inventory',
  '/sales-returns',
  '/procurement',
  '/recipes',
  '/offers',
  '/order-center',
] as const;

export function routeNeedsCatalog(pathname: string): boolean {
  return CATALOG_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
