'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getEssays, createEssay } from '@/lib/actions'
import type { Card } from '@/lib/db'

interface Props {
  open: boolean
  onClose: () => void
}

type View = 'list' | 'reader' | 'editor'

export default function EssayViewer({ open, onClose }: Props) {
  const [essays, setEssays] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Card | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const data = await getEssays()
    setEssays(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) fetch()
  }, [open, fetch])

  const openReader = useCallback((essay: Card) => {
    setSelected(essay)
    setView('reader')
  }, [])

  const openEditor = useCallback(() => {
    setTitle('')
    setBody('')
    setView('editor')
  }, [])

  const handleSave = useCallback(async () => {
    if (!title.trim() || !body.trim() || sending) return
    setSending(true)
    const result = await createEssay(title.trim(), body.trim())
    setSending(false)
    if (result.ok) {
      setTitle('')
      setBody('')
      setView('list')
      fetch()
    }
  }, [title, body, sending, fetch])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBody(reader.result as string)
    }
    reader.readAsText(file)
  }, [])

  const handleBack = useCallback(() => {
    setView('list')
    setSelected(null)
  }, [])

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/70 backdrop-blur-md px-4 py-16"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="w-full max-w-2xl rounded-sm border border-[#eeeeee] bg-white px-8 py-8"
          >
            {/* List view */}
            {view === 'list' && (
              <>
                <div className="mb-8 flex items-center justify-between">
                  <p className="font-mono text-[11px] tracking-widest uppercase text-gray-300 select-none">
                    Essays
                  </p>
                  <button
                    onClick={openEditor}
                    className="font-mono text-[11px] tracking-wider text-gray-400 hover:text-[#222222] transition-colors select-none"
                  >
                    + new
                  </button>
                </div>

                {loading ? (
                  <div className="flex justify-center py-12">
                    <span className="font-mono text-[11px] text-gray-300">Loading...</span>
                  </div>
                ) : essays.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <span className="font-mono text-[11px] tracking-widest text-gray-300">
                      No essays yet.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {essays.map((essay) => (
                      <button
                        key={essay.id}
                        onClick={() => openReader(essay)}
                        className="block w-full text-left group"
                      >
                        <span className="font-mono text-[13px] tracking-wide text-gray-400 group-hover:text-[#222222] transition-colors">
                          {(essay.meta as { title?: string }).title ?? 'Untitled'}
                        </span>
                        <span className="ml-3 font-mono text-[10px] text-gray-300">
                          {fmtDate(essay.created_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Reader view */}
            {view === 'reader' && selected && (
              <>
                <div className="mb-8 flex items-center gap-4">
                  <button
                    onClick={handleBack}
                    className="font-mono text-[11px] tracking-wider text-gray-300 hover:text-gray-500 transition-colors select-none"
                  >
                    ← back
                  </button>
                  <p className="font-mono text-[11px] tracking-widest uppercase text-gray-400 select-none">
                    {(selected.meta as { title?: string }).title ?? 'Untitled'}
                  </p>
                </div>

                <div className="prose prose-sm prose-gray max-w-none prose-headings:font-normal prose-headings:text-[#222222] prose-p:text-[#222222] prose-a:text-gray-500 prose-blockquote:border-[#eeeeee] prose-blockquote:text-gray-500 prose-code:text-[#222222] prose-code:bg-gray-50 prose-code:px-1 prose-code:rounded-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.body}
                  </ReactMarkdown>
                </div>
              </>
            )}

            {/* Editor view */}
            {view === 'editor' && (
              <>
                <div className="mb-8 flex items-center justify-between">
                  <p className="font-mono text-[11px] tracking-widest uppercase text-gray-300 select-none">
                    New essay
                  </p>
                  <button
                    onClick={handleBack}
                    className="font-mono text-[10px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none"
                  >
                    cancel
                  </button>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title..."
                    autoFocus
                    className="w-full bg-transparent text-lg text-[#222222] placeholder:text-gray-300 outline-none"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write in markdown..."
                    rows={12}
                    className="w-full resize-none bg-gray-50 px-4 py-3 text-sm leading-relaxed text-[#222222] placeholder:text-gray-300 outline-none rounded-sm font-mono"
                  />
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSave}
                      disabled={sending || !title.trim() || !body.trim()}
                      className="font-mono text-[11px] tracking-widest text-gray-400 hover:text-[#222222] transition-colors select-none disabled:text-gray-300 disabled:cursor-default"
                    >
                      {sending ? '...' : 'Save'}
                    </button>
                    <label className="font-mono text-[10px] tracking-wider text-gray-300 hover:text-gray-400 transition-colors select-none cursor-pointer">
                      Upload .md
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".md,.mdx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
