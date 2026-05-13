import { sql } from '@/lib/db'

export async function GET() {
  // Widen type check constraint to include new hidden types
  await sql`
    ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check
  `
  await sql`
    ALTER TABLE cards ADD CONSTRAINT cards_type_check
    CHECK (type IN ('dialog', 'record', 'photo', 'essay'))
  `

  // Add meta column for photo/essay metadata
  await sql`
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS
    meta JSONB DEFAULT '{}'::jsonb
  `

  // Ensure index
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cards_updated
    ON cards (updated_at DESC);
  `

  return Response.json({ ok: true })
}
