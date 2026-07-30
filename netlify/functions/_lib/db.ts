import { getDatabase } from "@netlify/database";

type Database = ReturnType<typeof getDatabase>;
export type DbClient = Awaited<ReturnType<Database["pool"]["connect"]>>;

let cached: Database | null = null;

/** Lazily created so nothing connects at module load. */
export function db(): Database {
  if (!cached) cached = getDatabase();
  return cached;
}

/**
 * Runs `fn` inside a single transaction, rolling back on any throw. Used for
 * writes that touch more than one table — a half-saved invoice (row written,
 * line items missing) is worse than a failed save.
 */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already broken; the original error is what matters.
    }
    throw error;
  } finally {
    client.release();
  }
}

export type Row = Record<string, unknown>;

/**
 * Thin wrappers over pg so call sites get `Row[]` instead of `any[]` — the
 * driver's own generics default to `any`, which quietly disables type checking
 * on everything read out of the database.
 */
export async function query(text: string, params: unknown[] = []): Promise<Row[]> {
  const result = await db().pool.query(text, params as never[]);
  return result.rows as Row[];
}

export async function queryOne(text: string, params: unknown[] = []): Promise<Row | null> {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

/** Returns the number of affected rows. */
export async function execute(text: string, params: unknown[] = []): Promise<number> {
  const result = await db().pool.query(text, params as never[]);
  return result.rowCount ?? 0;
}

/** Same as `query`, but on a client already inside a transaction. */
export async function clientQuery(
  client: DbClient,
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const result = await client.query(text, params as never[]);
  return result.rows as Row[];
}

/** Postgres BIGINT arrives as a string via pg; NUMERIC does too. */
export function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** DATE columns come back as JS Dates; the app wants YYYY-MM-DD strings. */
export function toDateString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : new Date().toISOString();
}
