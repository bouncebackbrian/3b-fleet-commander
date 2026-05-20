'use client'

interface Props {
  isOnline: boolean
}

export default function OfflineBanner({ isOnline }: Props) {
  if (isOnline) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400,
      background: 'rgba(50,50,50,.97)', color: '#fff',
      padding: '.5rem 1rem',
      fontSize: '.82rem', fontWeight: 700, letterSpacing: '.02em',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: '0 2px 16px rgba(0,0,0,.45)',
    }}>
      <span>📴</span>
      <span>Offline Mode — changes saving locally</span>
    </div>
  )
}
