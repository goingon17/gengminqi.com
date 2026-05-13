'use client'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { recordNote } from '@/lib/actions'
import type { Card as CardType } from '@/lib/db'
import CardGrid from './card-grid'
import AskModal from './modal'
import AdminCommandInput from './admin-command-input'
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
  const [essayOpen, setEssayOpen] = useState(false)

  // -- Record modal --
  const [recordText, setRecordText] = useState('')
  const [recordImages, setRecordImages] = useState<string[]>([])
  const [recordSending, setRecordSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // -- Keyboard shortcuts --
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "'" && !askOpen && !recordOpen && !essayOpen) {
      e.preventDefault()
      setAdmin((a) => !a)
    }
  }, [askOpen, recordOpen, essayOpen])

  const [listening, setListening] = useState(false)
  if (typeof window !== 'undefined' && !listening) {
    window.addEventListener('keydown', handleKeyDown)
    setListening(true)
  }

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setRecordImages((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
    // Reset so same file can be picked again
    e.target.value = ''
  }, [])

  const removeImage = useCallback((index: number) => {
    setRecordImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleRecord = useCallback(async () => {
    if (!recordText.trim() || recordSending) return
    setRecordSending(true)
    const meta = recordImages.length > 0 ? { images: recordImages } : undefined
    const result = await recordNote(recordText, meta)
    setRecordSending(false)
    if (result.ok) {
      setRecordText('')
      setRecordImages([])
      setRecordOpen(false)
      router.refresh()
    }
  }, [recordText, recordImages, recordSending, router])

  const closeRecord = useCallback(() => {
    setRecordOpen(false)
    setRecordText('')
    setRecordImages([])
  }, [])

  const handleCommand = useCallback((cmd: string) => {
    switch (cmd) {
      case 'record':
        setRecordOpen(true)
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

      {/* Admin command input */}
      {admin && hasEngaged && !askOpen && !recordOpen && !essayOpen && (
        <AdminCommandInput onCommand={handleCommand} />
      )}

      {/* Record modal with image upload */}
      <AnimatePresence>
        {recordOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeRecord() }}
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

              {/* Image previews */}
              {recordImages.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {recordImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img}
                        alt=""
                        className="w-16 h-16 rounded-sm object-cover border border-[#eeeeee]"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-[#eeeeee] font-mono text-[10px] text-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="font-mono text-[10px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none cursor-pointer">
                    + image
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={closeRecord}
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
