import postgres from 'postgres'

export const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

export interface Card {
  id: string
  type: 'qa' | 'note'
  question: string
  answer: string
  body: string
  is_answered: boolean
  created_at: string
  answered_at: string | null
}
