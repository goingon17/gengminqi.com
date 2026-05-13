'use client'

import { useState } from 'react'

interface Props {
  onCommand: (cmd: string) => void
}

export default function AdminCommandInput({ onCommand }: Props) {
  const [value, setValue] = useState('')

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-10 z-40">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px] text-gray-300 select-none">$</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onCommand(value.trim().toLowerCase())
              setValue('')
            }
            if (e.key === 'Escape') {
              setValue('')
            }
          }}
          placeholder="type a command..."
          autoFocus
          className="
            bg-transparent font-mono text-[11px] tracking-widest
            text-[#222222] placeholder:text-gray-300
            outline-none w-40
          "
        />
      </div>
    </div>
  )
}
