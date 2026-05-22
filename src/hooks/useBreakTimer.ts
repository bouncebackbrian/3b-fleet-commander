'use client'
import { useState, useEffect } from 'react'
import { opLog } from '@/lib/logger'
import { toast } from '@/hooks/useToast'
import { logTimelineEvent } from '@/lib/timeline'

export const BREAK_TARGET = 30 * 60 // 30 min in seconds

export function fmtBreak(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function useBreakTimer() {
  const [breakActive,    setBreakActive]    = useState(false)
  const [breakStart,     setBreakStart]     = useState(0)
  const [breakSecs,      setBreakSecs]      = useState(0)
  const [showBreakModal, setShowBreakModal] = useState(false)

  useEffect(() => {
    if (!breakActive) return
    const id = setInterval(
      () => setBreakSecs(Math.floor((Date.now() - breakStart) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [breakActive, breakStart])

  const handleStartBreak = () => {
    // Duplicate guard — already running, just show the modal
    if (breakActive) {
      opLog.guard('Break start skipped — timer already active')
      setShowBreakModal(true)
      return
    }
    const now = Date.now()
    setBreakStart(now)
    setBreakSecs(0)
    setBreakActive(true)
    setShowBreakModal(true)
    opLog.break('Break timer started')
    toast.success('Break timer started — 30 min clock running')
    void logTimelineEvent('break_started', 'break_timer', { startedAt: new Date(now).toISOString() })
    try {
      localStorage.setItem(
        '3b-hos-event',
        JSON.stringify({ type: 'break', startedAt: new Date(now).toISOString() }),
      )
    } catch { /* ignore */ }
  }

  const handleEndBreak = () => {
    const mins = (breakSecs / 60).toFixed(1)
    setBreakActive(false)
    setShowBreakModal(false)
    opLog.break(`Break ended — ${mins} min elapsed`, { breakSecs })
    const complete = breakSecs >= BREAK_TARGET
    if (complete) {
      toast.success(`Break complete — ${mins} min logged ✓`)
    } else {
      toast.warn(`Break ended early — ${mins} min (need 30)`)
    }
    void logTimelineEvent('break_ended', 'break_timer', {
      durationSecs: breakSecs,
      durationMins: parseFloat(mins),
      complete,
    })
    try {
      localStorage.setItem(
        '3b-hos-event',
        JSON.stringify({ type: 'break-end', endedAt: new Date().toISOString(), durationSecs: breakSecs }),
      )
    } catch { /* ignore */ }
  }

  return {
    breakActive,
    breakSecs,
    showBreakModal,
    setShowBreakModal,
    handleStartBreak,
    handleEndBreak,
    BREAK_TARGET,
    fmtBreak,
  }
}
