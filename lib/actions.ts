'use server'

import { sql, type Card, type Message } from './db'

function checkPassword(input?: string): boolean {
  return input === process.env.APP_PASSWORD
}

export async function verifyPassword(password: string): Promise<boolean> {
  return checkPassword(password)
}

export async function getCards(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards ORDER BY updated_at DESC LIMIT 200
  `
  return rows as unknown as Card[]
}

export async function createDialog(body: string): Promise<Card> {
  const msg: Message = {
    author: 'visitor',
    body: body.trim(),
    created_at: new Date().toISOString(),
  }

  const [card] = await sql`
    INSERT INTO cards (type, messages)
    VALUES ('dialog', ${sql.json([msg] as any)})
    RETURNING *
  `
  return card as unknown as Card
}

export async function addMessage(
  cardId: string,
  body: string,
  password?: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const author: Message['author'] = checkPassword(password) ? 'me' : 'visitor'
  const msg: Message = {
    author,
    body: body.trim(),
    created_at: new Date().toISOString(),
  }

  const [card] = await sql`
    UPDATE cards
    SET messages = messages || ${sql.json([msg] as any)}::jsonb,
        updated_at = now()
    WHERE id = ${cardId}
    RETURNING *
  `

  if (!card) return { ok: false, error: 'Card not found.' }
  return { ok: true, card: card as unknown as Card }
}

export async function recordNote(
  body: string,
  password?: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  if (!checkPassword(password)) return { ok: false, error: 'Unauthorized.' }

  const [card] = await sql`
    INSERT INTO cards (type, body)
    VALUES ('record', ${body.trim()})
    RETURNING *
  `
  return { ok: true, card: card as unknown as Card }
}
