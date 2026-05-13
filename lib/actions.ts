'use server'

import { sql, type Card } from './db'

function checkPassword(input?: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) return false
  return input === expected
}

export async function verifyPassword(password: string): Promise<boolean> {
  return checkPassword(password)
}

export async function getCards(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards ORDER BY created_at DESC LIMIT 200
  `
  return rows as unknown as Card[]
}

export async function askQuestion(body: string): Promise<Card> {
  const [card] = await sql`
    INSERT INTO cards (type, question)
    VALUES ('qa', ${body.trim()})
    RETURNING *
  `
  return card as unknown as Card
}

export async function replyToQuestion(
  id: string,
  answer: string,
  password?: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  if (!checkPassword(password)) {
    return { ok: false, error: 'Unauthorized.' }
  }

  const [card] = await sql`
    UPDATE cards
    SET answer = ${answer.trim()}, is_answered = true, answered_at = now()
    WHERE id = ${id} AND type = 'qa'
    RETURNING *
  `

  if (!card) return { ok: false, error: 'Card not found.' }
  return { ok: true, card: card as unknown as Card }
}

export async function recordNote(
  body: string,
  password?: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  if (!checkPassword(password)) {
    return { ok: false, error: 'Unauthorized.' }
  }

  const [card] = await sql`
    INSERT INTO cards (type, body)
    VALUES ('note', ${body.trim()})
    RETURNING *
  `
  return { ok: true, card: card as unknown as Card }
}
