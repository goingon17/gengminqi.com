'use client'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { createCard } from '@/lib/actions'
import type { CardType } from '@/lib/db'

interface Props {
  open: boolean
  onClose: () => void
  onSubmitted?: () => void
}

export default function Modal({ open, onClose, onSubmitted }: Props) {
  const [mode, setMode] = useState<CardType>('post')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(async () => {
    if (!body.trim() || sending) return
    setSending(true)

    await createCard({ type: mode, body })

    setBody('')
    setSending(false)
    onClose()
    onSubmitted?.()
    router.refresh()
  }, [body, mode, sending, onClose, onSubmitted, router])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-md px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="w-full max-w-lg rounded-sm border border-[#eeeeee] bg-white px-8 py-8"
          >
            {/* Toggle */}
            <div className="mb-8 flex items-center gap-6 font-mono text-[11px] tracking-widest uppercase select-none">
              <button
                onClick={() => setMode('post')}
                className={`transition-colors ${
                  mode === 'post'
                    ? 'text-[#222222]'
                    : 'text-gray-300 hover:text-gray-400'
                }`}
              >
                Record
              </button>
              <button
                onClick={() => setMode('question')}
                className={`transition-colors ${
                  mode === 'question'
                    ? 'text-[#222222]'
                    : 'text-gray-300 hover:text-gray-400'
                }`}
              >
                Ask
              </button>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'post'
                  ? "What's on your mind?"
                  : 'Ask me anything...'
              }
              autoFocus
              rows={3}
              className="
                w-full resize-none bg-transparent
                text-lg leading-relaxed text-[#222222]
                placeholder:text-gray-300
                outline-none
              "
            />

            {/* Submit */}
            <div className="mt-8 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-gray-300 select-none">
                &#8984;+&#8629;
              </span>
              <button
                onClick={handleSubmit}
                disabled={sending || !body.trim()}
                className={`
                  font-mono text-[11px] tracking-widest uppercase
                  transition-colors select-none
                  ${sending || !body.trim()
                    ? 'text-gray-300 cursor-default'
                    : 'text-gray-400 hover:text-[#222222]'
                  }
                `}
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
