'use client'

import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import CardGrid from './card-grid'
import Modal from './modal'
import type { Card } from '@/lib/db'

export default function AppShell({ cards }: { cards: Card[] }) {
  const [hasEngaged, setHasEngaged] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const openModal = useCallback(() => {
    setHasEngaged(true)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <div className="relative min-h-screen">
      {/* Cards — only render after engagement */}
      {hasEngaged && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <CardGrid cards={cards} />
        </motion.div>
      )}

      {/* Idle state: centered button */}
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
              onClick={openModal}
              className="
                font-mono text-[11px] tracking-widest uppercase
                text-gray-300 hover:text-gray-500
                transition-colors select-none
              "
            >
              Say something
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button — appears after engagement, hidden when modal is open */}
      {hasEngaged && !modalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="fixed bottom-0 left-0 right-0 flex justify-center pb-10 pointer-events-none z-40"
        >
          <button
            onClick={openModal}
            className="
              pointer-events-auto
              font-mono text-[11px] tracking-widest uppercase
              text-gray-300 hover:text-gray-500
              transition-colors select-none
            "
          >
            Say something
          </button>
        </motion.div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={closeModal} />
    </div>
  )
}
