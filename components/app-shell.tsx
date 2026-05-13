'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { verifyPassword, replyToQuestion, recordNote } from '@/lib/actions'
import type { Card as CardType } from '@/lib/db'
import CardGrid from './card-grid'
import AskModal from './modal'

export default function AppShell({ cards }: { cards: CardType[] }) {
  const router = useRouter()

  // -- Engagement gate --
  const [hasEngaged, setHasEngaged] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const openAsk = useCallback(() => { setHasEngaged(true); setAskOpen(true) }, [])
  const closeAsk = useCallback(() => setAskOpen(false), [])

  // -- Admin mode --
  const [admin, setAdmin] = useState(false)
  const [pwPrompt, setPwPrompt] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwError, setPwError] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)

  // -- Record modal --
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordText, setRecordText] = useState('')
  const [recordSending, setRecordSending] = useState(false)

  // -- Keyboard shortcuts --
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // `'` key — toggle admin password prompt
      if (e.key === "'" && !askOpen && !recordOpen) {
        e.preventDefault()
        if (admin) {
          setAdmin(false)
        } else if (pwPrompt) {
          setPwPrompt(false)
          setPwValue('')
          setPwError(false)
        } else {
          setPwPrompt(true)
        }
      }
      // Escape — close any prompt / exit admin
      if (e.key === 'Escape') {
        setPwPrompt(false)
        setPwValue('')
        setPwError(false)
        if (!admin) setRecordOpen(false)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [admin, pwPrompt, askOpen, recordOpen])

  // Focus password input when it appears
  useEffect(() => {
    if (pwPrompt) pwRef.current?.focus()
  }, [pwPrompt])

  // Auto-blur password on verification
  const handlePwSubmit = useCallback(async () => {
    const ok = await verifyPassword(pwValue)
    if (ok) {
      setAdmin(true)
      setPwPrompt(false)
      setPwValue('')
      setPwError(false)
    } else {
      setPwError(true)
      setPwValue('')
    }
  }, [pwValue])

  // -- Admin: reply --
  const handleReply = useCallback(
    async (id: string, answer: string): Promise<boolean> => {
      if (!pwValue && !admin) return false
      const password = pwValue // captured from the prompt
      const result = await replyToQuestion(id, answer, password)
      if (result.ok) router.refresh()
      return result.ok
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin, router]
  )
  // Note: pwValue intentionally omitted — it's captured at password prompt time.
  // admin state is sufficient to gate visibility.

  // -- Admin: record --
  const handleRecord = useCallback(async () => {
    if (!recordText.trim() || recordSending) return
    setRecordSending(true)
    const result = await recordNote(recordText, pwValue)
    setRecordSending(false)
    if (result.ok) {
      setRecordText('')
      setRecordOpen(false)
      router.refresh()
    }
  }, [recordText, recordSending, pwValue, router])

  // -- Filter which cards to show --
  const visibleCards = useMemo(
    () => (admin ? cards : cards.filter((c) => c.type === 'note' || c.is_answered)),
    [cards, admin]
  )

  return (
    <div className="relative min-h-screen">
      {/* Cards grid */}
      {hasEngaged && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <CardGrid cards={visibleCards} admin={admin} onReply={handleReply} />
        </motion.div>
      )}

      {/* Idle state */}
      <AnimatePresence>
        {!hasEngaged && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-0 flex items-center justify-center"
          >
            <button
              onClick={openAsk}
              className="font-mono text-[11px] tracking-widest uppercase text-gray-300 hover:text-gray-500 transition-colors select-none"
            >
              Say something
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      {hasEngaged && !askOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="fixed bottom-0 left-0 right-0 flex justify-center pb-10 z-40"
        >
          <button
            onClick={openAsk}
            className="font-mono text-[11px] tracking-widest uppercase text-gray-300 hover:text-gray-500 transition-colors select-none"
          >
            Say something
          </button>
        </motion.div>
      )}

      {/* Admin: Record button */}
      {admin && hasEngaged && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="fixed bottom-0 left-0 pb-10 pl-10 z-40"
        >
          <button
            onClick={() => setRecordOpen(true)}
            className="font-mono text-[11px] tracking-widest uppercase text-gray-400 hover:text-[#222222] transition-colors select-none"
          >
            record
          </button>
        </motion.div>
      )}

      {/* Admin: password prompt */}
      <AnimatePresence>
        {pwPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-transparent pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-2">
              <input
                ref={pwRef}
                type="password"
                value={pwValue}
                onChange={(e) => { setPwValue(e.target.value); setPwError(false) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePwSubmit()
                  if (e.key === 'Escape') { setPwPrompt(false); setPwValue(''); setPwError(false) }
                }}
                placeholder={pwError ? 'try again' : '·'}
                className={`
                  w-28 bg-transparent text-center font-mono text-sm outline-none
                  placeholder:tracking-widest
                  ${pwError ? 'text-red-400 placeholder:text-red-300' : 'text-[#222222]'}
                `}
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record modal */}
      <AnimatePresence>
        {recordOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => { if (e.target === e.currentTarget) setRecordOpen(false) }}
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
                Record
              </p>
              <textarea
                value={recordText}
                onChange={(e) => setRecordText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleRecord()
                  }
                }}
                placeholder="Just a thought..."
                autoFocus
                rows={3}
                className="w-full resize-none bg-transparent text-lg leading-relaxed text-[#222222] placeholder:text-gray-300 outline-none"
              />
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => { setRecordOpen(false); setRecordText('') }}
                  className="font-mono text-[10px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none"
                >
                  cancel
                </button>
                <button
                  onClick={handleRecord}
                  disabled={recordSending || !recordText.trim()}
                  className={`
                    font-mono text-[11px] tracking-widest uppercase transition-colors select-none
                    ${recordSending || !recordText.trim() ? 'text-gray-300 cursor-default' : 'text-gray-400 hover:text-[#222222]'}
                  `}
                >
                  {recordSending ? '...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ask modal */}
      <AskModal open={askOpen} onClose={closeAsk} />
    </div>
  )
}
