'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getPhotos, createPhoto } from '@/lib/actions'
import type { Card } from '@/lib/db'

interface Props {
  open: boolean
  onClose: () => void
  password: string
}

export default function PhotoGallery({ open, onClose, password }: Props) {
  const [photos, setPhotos] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const data = await getPhotos(password)
    setPhotos(data)
    setLoading(false)
  }, [password])

  useEffect(() => {
    if (open) fetch()
  }, [open, fetch])

  const handleUpload = useCallback(async () => {
    if (!url.trim() || sending) return
    setSending(true)
    const result = await createPhoto(url.trim(), caption.trim(), password)
    setSending(false)
    if (result.ok) {
      setUrl('')
      setCaption('')
      setShowUpload(false)
      fetch()
    }
  }, [url, caption, sending, password, fetch])

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
            className="w-full max-w-3xl rounded-sm border border-[#eeeeee] bg-white px-8 py-8"
          >
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-widest uppercase text-gray-300 select-none">
                Photos
              </p>
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="font-mono text-[11px] tracking-wider text-gray-400 hover:text-[#222222] transition-colors select-none"
              >
                {showUpload ? 'cancel' : '+ upload'}
              </button>
            </div>

            {/* Upload form */}
            {showUpload && (
              <div className="mb-8 space-y-3 p-4 bg-gray-50 rounded-sm">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Image URL..."
                  autoFocus
                  className="w-full bg-transparent text-sm text-[#222222] placeholder:text-gray-300 outline-none"
                />
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  className="w-full bg-transparent text-sm text-[#222222] placeholder:text-gray-300 outline-none"
                />
                <button
                  onClick={handleUpload}
                  disabled={sending || !url.trim()}
                  className="font-mono text-[11px] tracking-widest text-gray-400 hover:text-[#222222] transition-colors select-none disabled:text-gray-300 disabled:cursor-default"
                >
                  {sending ? '...' : 'Save'}
                </button>
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="flex justify-center py-12">
                <span className="font-mono text-[11px] text-gray-300">Loading...</span>
              </div>
            ) : photos.length === 0 ? (
              <div className="flex justify-center py-12">
                <span className="font-mono text-[11px] tracking-widest text-gray-300">
                  No photos yet.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="space-y-1">
                    <img
                      src={photo.body}
                      alt={(photo.meta as { caption?: string }).caption ?? ''}
                      className="w-full rounded-sm object-cover aspect-square border border-[#eeeeee]"
                    />
                    {(photo.meta as { caption?: string }).caption && (
                      <p className="font-mono text-[10px] text-gray-400 leading-tight">
                        {(photo.meta as { caption?: string }).caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
