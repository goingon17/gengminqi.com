import { sql } from '@/lib/db'

export async function GET() {
  await sql`
    CREATE TABLE IF NOT EXISTS cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(10) NOT NULL CHECK (type IN ('post', 'question')),
      body TEXT NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cards_public_created
    ON cards (is_public, created_at DESC)
    WHERE is_public = true;
  `

  return Response.json({ ok: true })
}
