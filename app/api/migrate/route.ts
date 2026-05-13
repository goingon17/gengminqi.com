import { sql } from '@/lib/db'

export async function GET() {
  await sql`DROP TABLE IF EXISTS cards`

  await sql`
    CREATE TABLE cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(10) NOT NULL DEFAULT 'dialog' CHECK (type IN ('dialog', 'record')),
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cards_updated
    ON cards (updated_at DESC);
  `

  return Response.json({ ok: true })
}
