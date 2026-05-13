import postgres from 'postgres'

export const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

export interface Message {
  author: 'visitor' | 'me'
  body: string
  created_at: string
}

export interface Card {
  id: string
  type: 'dialog' | 'record'
  messages: Message[]
  body: string
  created_at: string
  updated_at: string
}
