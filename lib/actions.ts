'use server'

import { sql, type Card, type CardType } from './db'

export async function getPublicCards(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards
    WHERE is_public = true
    ORDER BY created_at DESC
    LIMIT 200
  `
  return rows as unknown as Card[]
}

export async function createCard(params: {
  type: CardType
  body: string
}): Promise<Card> {
  const [card] = await sql`
    INSERT INTO cards (type, body, is_public)
    VALUES (${params.type}, ${params.body.trim()}, true)
    RETURNING *
  `
  return card as unknown as Card
}
