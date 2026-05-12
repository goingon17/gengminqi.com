'use client'

import { motion } from 'framer-motion'
import type { Card as CardType } from '@/lib/db'

// Deterministic pseudo-random from card id, stable across renders
function hash(id: string, offset: number): number {
  let h = offset
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return (h & 0xffff) / 0xffff
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export default function Card({ card, index }: { card: CardType; index: number }) {
  const rotate = (hash(card.id, 7) - 0.5) * 2 // -1 to 1 deg
  const mt = hash(card.id, 13) * 16 // 0 to 16px

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: rotate + (Math.random() - 0.5) * 4 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 20,
        delay: index * 0.06,
      }}
      whileHover={{
        y: -2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        transition: { duration: 0.2, ease: 'easeOut' },
      }}
      style={{ marginTop: `${mt}px` }}
      className="
        break-inside-avoid mb-6 rounded-sm border border-[#eeeeee]
        bg-white px-6 py-5
      "
    >
      {/* Date */}
      <time className="mb-3 block font-mono text-[11px] tracking-widest text-gray-400 select-none">
        {fmtDate(card.created_at)}
      </time>

      {/* Body */}
      <p className="text-lg leading-relaxed text-[#222222]">
        {card.body}
      </p>

      {/* Question indicator */}
      {card.type === 'question' && (
        <span className="mt-3 block text-[11px] tracking-widest text-gray-300 select-none">
          — Q
        </span>
      )}
    </motion.div>
  )
}
