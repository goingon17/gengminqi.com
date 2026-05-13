'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { verifyPassword, recordNote } from '@/lib/actions'
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

  // -- Admin mode --
  const [admin, setAdmin] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [pwPrompt, setPwPrompt] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwError, setPwError] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)

  // -- Overlays --
  const [recordOpen, setRecordOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [essayOpen, setEssayOpen] = useState(false)

  // -- Record modal --
  const [recordText, setRecordText] = useState('')
  const [recordSending, setRecordSending] = useState(false)

  // -- Keyboard shortcuts --
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "'" && !askOpen && !recordOpen && !photoOpen && !essayOpen) {
        e.preventDefault()
        if (admin) {
          setAdmin(false)
          setAdminPassword('')
        } else if (pwPrompt) {
          setPwPrompt(false)
          setPwValue('')
          setPwError(false)
        } else {
          setPwPrompt(true)
        }
      }
      if (e.key === 'Escape') {
        setPwPrompt(false)
        setPwValue('')
        setPwError(false)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [admin, pwPrompt, askOpen, recordOpen, photoOpen, essayOpen])

  useEffect(() => {
    if (pwPrompt) pwRef.current?.focus()
  }, [pwPrompt])

  const handlePwSubmit = useCallback(async () => {
    const ok = await verifyPassword(pwValue)
    if (ok) {
      setAdmin(true)
      setAdminPassword(pwValue)
      setPwPrompt(false)
      setPwValue('')
      setPwError(false)
    } else {
      setPwError(true)
      setPwValue('')
    }
  }, [pwValue])

  const handleRecord = useCallback(async () => {
    if (!recordText.trim() || recordSending) return
    setRecordSending(true)
    const result = await recordNote(recordText, adminPassword)
    setRecordSending(false)
    if (result.ok) {
      setRecordText('')
      setRecordOpen(false)
      router.refresh()
    }
  }, [recordText, recordSending, adminPassword, router])

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
        setAdminPassword('')
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
          <CardGrid cards={cards} admin={admin} adminPassword={adminPassword} />
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
      {admin && hasEngaged && !askOpen && !recordOpen && !photoOpen && !essayOpen && (
        <AdminCommandInput onCommand={handleCommand} />
      )}

      {/* Mobile admin trigger — subtle dot, bottom-right */}
      {!admin && (
        <button
          onClick={() => setPwPrompt(true)}
          className="fixed bottom-6 right-6 z-40 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-400 transition-colors text-lg leading-none select-none"
          aria-label="Admin"
        >
          ·
        </button>
      )}

      {/* Password prompt */}
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

      {/* Photo gallery overlay */}
      <PhotoGallery
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        password={adminPassword}
      />

      {/* Essay viewer overlay */}
      <EssayViewer
        open={essayOpen}
        onClose={() => setEssayOpen(false)}
        password={adminPassword}
      />

      {/* Ask modal */}
      <AskModal open={askOpen} onClose={closeAsk} />
    </div>
  )
}
