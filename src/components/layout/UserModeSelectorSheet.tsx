'use client'
/**
 * UserModeSelectorSheet — Portal focus picker bottom sheet.
 *
 * Shown on first launch (when no mode stored) and from Settings / TopBar.
 * Options are constrained to the portals the member actually holds (see
 * userMode.ts) — no more self-selecting into a portal you weren't granted.
 * Writes to localStorage + fires '3b-mode-changed' event → BottomNav re-renders.
 *
 * Usage:
 *   <UserModeSelectorSheet open={show} onClose={() => setShow(false)} />
 */
import { useState, useEffect } from 'react'
import { MODE_CONFIG, writeUserMode, readUserMode, getTabsForMode, getAvailableModes, getDefaultMode, type UserMode } from '@/lib/userMode'
import { getCurrentUser, type Portal, type PortalGrants, type OpsProfile } from '@/lib/auth-adapter'

interface Props {
  open:      boolean
  onClose:   () => void
  isFirstRun?: boolean   // hides close button, forces selection
}

export default function UserModeSelectorSheet({ open, onClose, isFirstRun = false }: Props) {
  const [portals, setPortals] = useState<PortalGrants>({})
  const [opsProfile, setOpsProfile] = useState<OpsProfile | null>(null)
  const [driverOpsProfile, setDriverOpsProfile] = useState<OpsProfile | null>(null)
  const [modes, setModes] = useState<UserMode[]>([])
  const [selected, setSelected] = useState<UserMode | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getCurrentUser().then(user => {
      if (cancelled) return
      const grants = user?.portals ?? {}
      setPortals(grants)
      setOpsProfile(user?.opsProfile ?? null)
      setDriverOpsProfile(user?.driverOpsProfile ?? user?.opsProfile ?? null)
      const available = getAvailableModes(grants)
      setModes(available)
      const stored = readUserMode()
      setSelected(stored && available.includes(stored) ? stored : getDefaultMode(grants))
    })
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  if (modes.length === 0) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.7)' }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
          background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: '1.5rem',
        }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: 6 }}>No portals granted yet</div>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            Ask your business owner or admin to grant you access in Settings → Team.
          </div>
        </div>
      </>
    )
  }

  function handleSave() {
    if (!selected) return
    setSaving(true)
    writeUserMode(selected)
    setTimeout(() => {
      setSaving(false)
      onClose()
    }, 300)
  }

  const current = selected ? MODE_CONFIG[selected] : null
  const grantedPortals = Object.keys(portals) as Portal[]
  const tabs = selected ? getTabsForMode(selected, grantedPortals, selected === 'driver' ? driverOpsProfile : opsProfile) : []

  return (
    <>
      {/* Backdrop — only dismissible if not first-run */}
      <div
        onClick={isFirstRun ? undefined : onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)',
          cursor: isFirstRun ? 'default' : 'pointer',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '24px 24px 0 0',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '.75rem 1.25rem .65rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>
              3B Fleet Commander
            </div>
            <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 2 }}>
              {isFirstRun ? 'Select your focus to get started' : 'Switch focus'}
            </div>
          </div>
          {!isFirstRun && (
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.3rem', color: 'var(--muted)', padding: '4px 8px',
            }}>✕</button>
          )}
        </div>

        {/* Mode cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modes.map(mode => {
              const cfg = MODE_CONFIG[mode]
              const sel = selected === mode
              return (
                <button
                  key={mode}
                  onClick={() => setSelected(mode)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    padding: '.85rem 1rem', borderRadius: 16,
                    border: `2px solid ${sel ? cfg.color : 'var(--border)'}`,
                    background: sel ? `color-mix(in srgb, ${cfg.color} 8%, var(--surface))` : 'var(--surface-2)',
                    transition: 'all .15s',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: sel ? `color-mix(in srgb, ${cfg.color} 20%, transparent)` : 'var(--surface)',
                      border: `1.5px solid ${sel ? cfg.color : 'var(--border)'}`,
                      display: 'grid', placeItems: 'center',
                      fontSize: '1.3rem', flexShrink: 0,
                    }}>
                      {cfg.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 900, fontSize: '.95rem',
                        color: sel ? cfg.color : 'var(--text)',
                      }}>
                        {cfg.label}
                      </div>
                      <div style={{
                        fontSize: '.7rem', color: 'var(--muted)',
                        fontWeight: 600, marginTop: 1,
                      }}>
                        {cfg.tagline}
                      </div>
                    </div>
                    {sel && (
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: cfg.color, display: 'grid', placeItems: 'center',
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '.7rem', color: '#000', fontWeight: 900 }}>✓</span>
                      </div>
                    )}
                  </div>
                  {sel && (
                    <div style={{ marginTop: 8, fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {cfg.description}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab preview */}
          {current && (
            <div style={{
              marginTop: 16, padding: '.75rem 1rem',
              borderRadius: 14, border: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}>
              <div style={{
                fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8,
              }}>
                Your tabs in {current.label} focus
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                  <div key={tab.href} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '.3rem .7rem', borderRadius: 20,
                    background: 'var(--surface)', border: `1px solid ${current.color}40`,
                    fontSize: '.78rem', fontWeight: 700, color: 'var(--text)',
                  }}>
                    <span>{tab.emoji}</span>
                    <span>{tab.label}</span>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 8, fontSize: '.68rem', color: 'var(--faint)',
                fontStyle: 'italic',
              }}>
                All data is shared — switching focus doesn&apos;t delete anything.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: '.75rem 1.1rem 1.5rem',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={handleSave}
            disabled={saving || !selected}
            style={{
              width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
              background: current ? (current.color === 'var(--primary)' ? 'var(--primary)' : current.color) : 'var(--surface-2)',
              color: '#000', fontWeight: 900, fontSize: '1rem',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? .7 : 1, transition: 'all .2s',
            }}
          >
            {saving ? 'Saving…' : isFirstRun
              ? `Launch as ${current?.label} ${current?.emoji ?? ''}`
              : `Switch to ${current?.label} ${current?.emoji ?? ''}`}
          </button>
          {!isFirstRun && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: '.7rem', color: 'var(--faint)' }}>
              You can change this anytime in Settings.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
