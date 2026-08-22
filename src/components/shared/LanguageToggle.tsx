'use client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/** One-tap EN/ES switch for a translated page — drop inside a <LanguageProvider>. */
export default function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
      title={lang === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'}
      style={{
        padding: '.5rem .8rem', borderRadius: 10, background: 'var(--surface-2)',
        border: '1px solid var(--border)', color: 'var(--primary)', fontWeight: 800, fontSize: '.82rem',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}
    >
      🌐 {lang === 'en' ? 'EN' : 'ES'}
    </button>
  )
}
