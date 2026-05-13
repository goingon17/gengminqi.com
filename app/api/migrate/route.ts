import { sql } from '@/lib/db'

export async function GET() {
  await sql`DROP TABLE IF EXISTS cards`

  await sql`
    CREATE TABLE cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(10) NOT NULL DEFAULT 'qa' CHECK (type IN ('qa', 'note')),
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      is_answered BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      answered_at TIMESTAMPTZ
    );
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cards_created
    ON cards (created_at DESC);
  `

  return Response.json({ ok: true })
}
