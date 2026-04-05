/** Throws if a mutation returned no rows (silent PostgreSQL UPDATE/DELETE failure). */
export function assertRowsAffected<T>(rows: T[] | null | undefined, message: string): T[] {
  if (!rows || rows.length === 0) {
    throw new Error(message);
  }
  return rows;
}
