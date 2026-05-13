'use server'

import { sql, type Card, type Message } from './db'

export async function getCards(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards
    WHERE type IN ('dialog', 'record')
    ORDER BY updated_at DESC LIMIT 200
  `
  return rows as unknown as Card[]
}

export async function getPhotos(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards WHERE type = 'photo' ORDER BY created_at DESC
  `
  return rows as unknown as Card[]
}

export async function getEssays(): Promise<Card[]> {
  const rows = await sql`
    SELECT * FROM cards WHERE type = 'essay' ORDER BY created_at DESC
  `
  return rows as unknown as Card[]
}

export async function createPhoto(
  url: string,
  caption: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const [card] = await sql`
    INSERT INTO cards (type, body, meta)
    VALUES ('photo', ${url}, ${sql.json({ caption } as any)})
    RETURNING *
  `
  return { ok: true, card: card as unknown as Card }
}

export async function createEssay(
  title: string,
  body: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const [card] = await sql`
    INSERT INTO cards (type, body, meta)
    VALUES ('essay', ${body.trim()}, ${sql.json({ title } as any)})
    RETURNING *
  `
  return { ok: true, card: card as unknown as Card }
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
  asAdmin?: boolean
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const author: Message['author'] = asAdmin ? 'me' : 'visitor'
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
  body: string
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const [card] = await sql`
    INSERT INTO cards (type, body)
    VALUES ('record', ${body.trim()})
    RETURNING *
  `
  return { ok: true, card: card as unknown as Card }
}
