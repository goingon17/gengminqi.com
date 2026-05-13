'use client'

import Card from './card'
import type { Card as CardType } from '@/lib/db'

export default function CardGrid({
  cards,
  admin,
}: {
  cards: CardType[]
  admin?: boolean
}) {
  if (cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center pt-20">
        <p className="text-sm text-gray-300 font-mono tracking-widest">
          Nothing here yet.
        </p>
      </div>
    )
  }

  return (
    <div className="columns-1 md:columns-2 lg:columns-3 gap-6 px-6 py-10 md:px-10 md:py-14">
      {cards.map((card, i) => (
        <Card key={card.id} card={card} index={i} admin={admin} />
      ))}
    </div>
  )
}
