'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { addMessage } from '@/lib/actions'
import type { Card as CardType, Message } from '@/lib/db'

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

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function MessageBubble({ msg }: { msg: Message }) {
  const isMe = msg.author === 'me'
  return (
    <div className={isMe ? 'ml-4 pl-4 border-l border-[#eeeeee]' : ''}>
      {isMe && (
        <span className="block font-mono text-[10px] tracking-widest text-gray-300 mb-1 select-none">
          me
        </span>
      )}
      <p className="text-base leading-relaxed text-[#222222]">{msg.body}</p>
      <time className="block mt-1 font-mono text-[10px] text-gray-300 select-none">
        {fmtTime(msg.created_at)}
      </time>
    </div>
  )
}

export default function Card({
  card,
  index,
  admin,
  adminPassword,
}: {
  card: CardType
  index: number
  admin?: boolean
  adminPassword?: string
}) {
  const router = useRouter()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const rotate = (hash(card.id, 7) - 0.5) * 2
  const mt = hash(card.id, 13) * 16

  const handleReply = useCallback(async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    const result = await addMessage(card.id, replyText, adminPassword)
    setSending(false)
    if (result.ok) {
      setReplyText('')
      setReplyOpen(false)
      router.refresh()
    }
  }, [replyText, sending, card.id, adminPassword, router])

  const count = card.type === 'dialog' ? card.messages.length : 0

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
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <time className="font-mono text-[11px] tracking-widest text-gray-400 select-none">
          {fmtDate(card.created_at)}
        </time>
        {count > 0 && (
          <span className="font-mono text-[10px] text-gray-300 select-none">
            {count} msgs
          </span>
        )}
      </div>

      {/* Record type */}
      {card.type === 'record' && (
        <p className="text-lg leading-relaxed text-[#222222]">{card.body}</p>
      )}

      {/* Fallback for unknown types */}
      {card.type !== 'dialog' && card.type !== 'record' && (
        <p className="text-lg leading-relaxed text-[#222222]">{card.body}</p>
      )}

      {/* Dialog type — threaded conversation */}
      {card.type === 'dialog' && (
        <div className="space-y-4">
          {card.messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Reply trigger */}
          {!replyOpen && (
            <button
              onClick={() => setReplyOpen(true)}
              className="font-mono text-[11px] tracking-wider text-gray-300 hover:text-gray-500 transition-colors select-none"
            >
              + reply
            </button>
          )}

          {/* Inline reply */}
          {replyOpen && (
            <div className="space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={admin ? 'Reply as me...' : 'Add to this conversation...'}
                autoFocus
                rows={2}
                className="w-full resize-none bg-gray-50 px-3 py-2 text-sm leading-relaxed text-[#222222] placeholder:text-gray-300 outline-none rounded-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="font-mono text-[11px] tracking-widest text-gray-400 hover:text-[#222222] transition-colors select-none disabled:text-gray-300 disabled:cursor-default"
                >
                  {sending ? '...' : 'Send'}
                </button>
                <button
                  onClick={() => { setReplyOpen(false); setReplyText('') }}
                  className="font-mono text-[11px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none"
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
