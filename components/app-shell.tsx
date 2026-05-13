'use client'

import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { recordNote } from '@/lib/actions'
import type { Card as CardType } from '@/lib/db'
import CardGrid from './card-grid'
import AskModal from './modal'
import AdminCommandInput from './admin-command-input'
import PhotoGallery from './photo-gallery'
import EssayViewer from './essay-viewer'

export default function AppShell({ cards }: { cards: CardType[] }) {
  const router = useRouter()

  // -- Engagement gate --
  const [hasEngaged, setHasEngaged] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const openAsk = useCallback(() => { setHasEngaged(true); setAskOpen(true) }, [])
  const closeAsk = useCallback(() => setAskOpen(false), [])

  // -- Admin mode (hidden, toggled by `'` key) --
  const [admin, setAdmin] = useState(false)

  // -- Overlays --
  const [recordOpen, setRecordOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [essayOpen, setEssayOpen] = useState(false)

  // -- Record modal --
  const [recordText, setRecordText] = useState('')
  const [recordSending, setRecordSending] = useState(false)

  // -- Keyboard shortcuts --
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "'" && !askOpen && !recordOpen && !photoOpen && !essayOpen) {
      e.preventDefault()
      setAdmin((a) => !a)
    }
  }, [askOpen, recordOpen, photoOpen, essayOpen])

  // Attach/detach listener with admin in closure via ref
  const [listening, setListening] = useState(false)
  if (typeof window !== 'undefined' && !listening) {
    window.addEventListener('keydown', handleKeyDown)
    setListening(true)
  }

  const handleRecord = useCallback(async () => {
    if (!recordText.trim() || recordSending) return
    setRecordSending(true)
    const result = await recordNote(recordText)
    setRecordSending(false)
    if (result.ok) {
      setRecordText('')
      setRecordOpen(false)
      router.refresh()
    }
  }, [recordText, recordSending, router])

  const handleCommand = useCallback((cmd: string) => {
    switch (cmd) {
      case 'record':
        setRecordOpen(true)
        break
      case 'photo':
        setPhotoOpen(true)
        break
      case 'tex':
        setEssayOpen(true)
        break
      case 'exit':
        setAdmin(false)
        break
    }
  }, [])

  return (
    <div className="relative min-h-screen">
      {/* Cards grid */}
      {hasEngaged && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <CardGrid cards={cards} admin={admin} />
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

      {/* Floating "Say something" button (non-admin) */}
      {!admin && hasEngaged && !askOpen && (
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

      {/* Admin command input (no visual hint on page) */}
      {admin && hasEngaged && !askOpen && !recordOpen && !photoOpen && !essayOpen && (
        <AdminCommandInput onCommand={handleCommand} />
      )}

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

      {/* Photo gallery overlay */}
      <PhotoGallery
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
      />

      {/* Essay viewer overlay */}
      <EssayViewer
        open={essayOpen}
        onClose={() => setEssayOpen(false)}
      />

      {/* Ask modal */}
      <AskModal open={askOpen} onClose={closeAsk} />
    </div>
  )
}
