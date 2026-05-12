import postgres from 'postgres'

export const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

export type CardType = 'post' | 'question'

export interface Card {
  id: string
  type: CardType
  body: string
  is_public: boolean
  created_at: string
}
