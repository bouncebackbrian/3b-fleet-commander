'use client'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export default function Sheet({ title, onClose, children }: Props) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(3,13,11,.75)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
        background: 'var(--surface)', borderTop: '2px solid var(--border)',
        borderRadius: '20px 20px 0 0', padding: '1.5rem 1.25rem 2rem',
        maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 -6px 32px rgba(0,0,0,.45)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1rem' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{title}</div>
          <button onClick={onClose} style={{ fontSize: '1.3rem', color: 'var(--muted)', padding: '.25rem .5rem' }}>✕</button>
        </div>
        {children}
      </div>
    </>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '.75rem', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: '1rem',
}

export const primaryBtnStyle: React.CSSProperties = {
  width: '100%', padding: '.9rem', borderRadius: 12, background: 'var(--primary)',
  color: 'var(--dt-on-primary, #04140f)', fontWeight: 900, fontSize: '1rem', minHeight: 52,
}
