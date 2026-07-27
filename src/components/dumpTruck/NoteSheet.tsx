'use client'
import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'

interface Props {
  onClose: () => void
  onSave: (notes: string) => Promise<void>
}

export default function NoteSheet({ onClose, onSave }: Props) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet title="Add Note" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <textarea
          style={{ ...inputStyle, minHeight: 120 }}
          placeholder="What's going on?"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          autoFocus
        />
        <button
          style={{ ...primaryBtnStyle, opacity: notes.trim() && !busy ? 1 : .5 }}
          disabled={!notes.trim() || busy}
          onClick={async () => { setBusy(true); await onSave(notes.trim()); setBusy(false); onClose() }}
        >
          {busy ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </Sheet>
  )
}
