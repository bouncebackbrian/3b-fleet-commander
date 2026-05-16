'use client'
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #061210 0%, #030c0a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', textAlign: 'center', gap: '1.5rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Logo */}
      <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 80, height: 80, borderRadius: 18, boxShadow: '0 0 32px rgba(0,232,176,.35)', objectFit: 'cover' }} />

      {/* Truck animation */}
      <div style={{ fontSize: '3.5rem', lineHeight: 1, filter: 'drop-shadow(0 0 12px rgba(0,232,176,.3))' }}>🚛</div>

      {/* Heading */}
      <div>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: 'clamp(1.4rem,5vw,2rem)', color: '#f0faf8', letterSpacing: '-.02em', lineHeight: 1.1 }}>
          No signal, no problem.
        </h1>
        <p style={{ margin: '.75rem 0 0', fontSize: '.95rem', color: 'rgba(255,255,255,.45)', lineHeight: 1.6, maxWidth: 320 }}>
          You&apos;re offline. Your trip data, expenses, and logs are saved locally and will sync when you reconnect.
        </p>
      </div>

      {/* What still works */}
      <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 16, padding: '1.1rem 1.4rem', maxWidth: 340, width: '100%', textAlign: 'left' }}>
        <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'rgba(0,232,176,.7)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.75rem' }}>
          Available offline
        </div>
        {[
          ['✅', 'Active trip & route data'],
          ['✅', 'HOS hours (last scanned)'],
          ['✅', 'Expense log & history'],
          ['✅', 'Load records'],
          ['✅', 'Fuel log & delay notes'],
          ['⚡', 'Live weather (resumes on reconnect)'],
          ['⚡', 'AI trip planning (resumes on reconnect)'],
        ].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '.3rem 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <span style={{ fontSize: '.9rem', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Retry button */}
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '.75rem 2rem', borderRadius: 12, border: '1px solid rgba(0,232,176,.35)', background: 'rgba(0,232,176,.08)', color: '#00e8b0', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', letterSpacing: '.04em', boxShadow: '0 0 20px rgba(0,232,176,.12)' }}>
        Try reconnecting →
      </button>

      <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.2)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        3B Fleet Commander · MIS Active
      </div>
    </div>
  )
}
