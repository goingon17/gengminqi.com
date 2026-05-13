'use client'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { askQuestion } from '@/lib/actions'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AskModal({ open, onClose }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(async () => {
    if (!body.trim() || sending) return
    setSending(true)
    await askQuestion(body)
    setBody('')
    setSending(false)
    onClose()
    router.refresh()
  }, [body, sending, onClose, router])

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
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-md px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="w-full max-w-lg rounded-sm border border-[#eeeeee] bg-white px-8 py-8"
          >
            <p className="mb-8 font-mono text-[11px] tracking-widest uppercase text-gray-300 select-none">
              Ask
            </p>

            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              autoFocus
              rows={3}
              className="
                w-full resize-none bg-transparent
                text-lg leading-relaxed text-[#222222]
                placeholder:text-gray-300
                outline-none
              "
            />

            <div className="mt-8 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-gray-300 select-none">
                &#8984;+&#8629;
              </span>
              <button
                onClick={handleSubmit}
                disabled={sending || !body.trim()}
                className={`
                  font-mono text-[11px] tracking-widest uppercase transition-colors select-none
                  ${sending || !body.trim() ? 'text-gray-300 cursor-default' : 'text-gray-400 hover:text-[#222222]'}
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
