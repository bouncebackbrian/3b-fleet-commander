'use client'
/**
 * SignaturePad — shared canvas-draw-to-PNG signature capture.
 * Used by both the driver's end-of-day sign-off and dispatch's "Confirm
 * Receipt" company sign-off on a digital dispatch ticket.
 */
import { useRef, useState, useEffect } from 'react'
import { primaryBtnStyle } from './Sheet'

interface Props {
  label: string
  onSave: (blob: Blob) => void
  onCancel: () => void
  busy?: boolean
}

export default function SignaturePad({ label, onSave, onCancel, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawing.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStroke.current = true
    if (empty) setEmpty(false)
  }

  const end = () => { drawing.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    hasStroke.current = false
    setEmpty(true)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasStroke.current) return
    canvas.toBlob(blob => { if (blob) onSave(blob) }, 'image/png')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
      <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Sign below with your finger or stylus — {label}</div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 160, borderRadius: 10, border: '1px solid var(--border)', touchAction: 'none', background: '#fff' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div style={{ display: 'flex', gap: '.6rem' }}>
        <button
          onClick={clear}
          style={{ flex: 1, padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }}
        >
          Clear
        </button>
        <button onClick={onCancel} style={{ flex: 1, padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }}>
          Cancel
        </button>
      </div>
      <button style={{ ...primaryBtnStyle, opacity: empty || busy ? .5 : 1 }} disabled={empty || busy} onClick={save}>
        {busy ? 'Saving…' : 'Sign & Submit'}
      </button>
    </div>
  )
}
