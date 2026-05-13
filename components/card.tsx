'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import type { Card as CardType } from '@/lib/db'

function hash(id: string, offset: number): number {
  let h = offset
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return (h & 0xffff) / 0xffff
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function Card({
  card,
  index,
  admin,
  onReply,
}: {
  card: CardType
  index: number
  admin?: boolean
  onReply?: (id: string, answer: string) => Promise<boolean>
}) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const rotate = (hash(card.id, 7) - 0.5) * 2
  const mt = hash(card.id, 13) * 16

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !onReply || sending) return
    setSending(true)
    const ok = await onReply(card.id, replyText)
    setSending(false)
    if (ok) {
      setReplyText('')
      setReplying(false)
    }
  }, [replyText, onReply, sending, card.id])

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
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
      className="break-inside-avoid mb-6 rounded-sm border border-[#eeeeee] bg-white px-6 py-5"
    >
      <time className="mb-4 block font-mono text-[11px] tracking-widest text-gray-400 select-none">
        {fmtDate(card.created_at)}
      </time>

      {/* Note — my own recordings */}
      {card.type === 'note' && (
        <p className="text-lg leading-relaxed text-[#222222]">{card.body}</p>
      )}

      {/* QA — conversation */}
      {card.type === 'qa' && (
        <>
          <p className="text-lg leading-relaxed text-[#222222]">{card.question}</p>

          {card.is_answered && card.answer && (
            <div className="mt-4 space-y-2">
              <div className="border-t border-[#eeeeee]" />
              <p className="text-base leading-relaxed text-gray-500">{card.answer}</p>
            </div>
          )}

          {/* Admin: reply to unanswered */}
          {admin && !card.is_answered && !replying && (
            <button
              onClick={() => setReplying(true)}
              className="mt-3 font-mono text-[11px] tracking-wider text-gray-300 hover:text-gray-500 transition-colors select-none"
            >
              reply →
            </button>
          )}

          {/* Admin: inline reply textarea */}
          {admin && replying && (
            <div className="mt-3 space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                autoFocus
                rows={2}
                className="w-full resize-none bg-gray-50 px-3 py-2 text-sm leading-relaxed text-[#222222] placeholder:text-gray-300 outline-none rounded-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="font-mono text-[11px] tracking-widest text-gray-400 hover:text-[#222222] transition-colors select-none disabled:text-gray-300 disabled:cursor-default"
                >
                  {sending ? '...' : 'Send'}
                </button>
                <button
                  onClick={() => { setReplying(false); setReplyText('') }}
                  className="font-mono text-[11px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none"
                >
                  cancel
                </button>
              </div>
            </div>
          )}

          <span className="mt-3 block font-mono text-[11px] tracking-widest text-gray-300 select-none">
            — Q
          </span>
        </>
      )}
    </motion.div>
  )
}
