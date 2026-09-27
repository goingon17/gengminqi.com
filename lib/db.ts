import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

const g = globalThis as typeof globalThis & { cardsSchema?: Promise<unknown> };

export function db(): Sql | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? neon(url) : null;
}

export function ensureSchema(sql: Sql) {
  g.cardsSchema ??= sql`
    CREATE TABLE IF NOT EXISTS exchanged_cards (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      message TEXT,
      fingerprint TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.catch((error) => {
    g.cardsSchema = undefined;
    throw error;
  });
  return g.cardsSchema;
}
