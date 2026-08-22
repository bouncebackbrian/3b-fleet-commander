'use client'
/**
 * lib/i18n/LanguageContext.tsx — lightweight EN/ES UI translation
 *
 * No i18n library — the codebase has none, and the actual need (a handful
 * of admin/dispatch pages, English-as-source-of-truth) doesn't warrant one.
 * The English string IS the dictionary key, so a page with a missing or
 * partial translation still renders correctly in English rather than a
 * blank/undefined key — translation coverage can grow incrementally with
 * zero risk of a broken string.
 *
 * `{placeholder}` tokens carry interpolated values (dates, names, counts)
 * through translation without the caller having to reassemble a sentence
 * from parts — write t('Showing {start} to {end}', {start, end}) once, and
 * the Spanish entry can reorder the words around the same tokens.
 *
 * Each page wraps its content in <LanguageProvider dictionary={...}>,
 * supplying only the strings it uses (see lib/i18n/dictionaries/*.ts).
 * Initial language comes from the signed-in user's stored preference
 * (profiles.preferred_language, via /api/fleet/me); toggling persists back
 * through the same PATCH endpoint the driver cockpit's toggle already uses,
 * so a person's choice follows them across every translated page.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

export type Lang = 'en' | 'es'

export interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Looks up `english` in the page's dictionary when lang is 'es'; always returns the English text as-is when lang is 'en' or the key has no translation yet. */
  t: (english: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  let out = template
  for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value))
  return out
}

export function LanguageProvider({ dictionary, children }: { dictionary: Record<string, string>; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    let cancelled = false
    fetch('/api/fleet/me').then(r => r.json()).then(b => {
      if (!cancelled && b?.user?.preferredLanguage === 'es') setLangState('es')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    fetch('/api/fleet/dump-truck/language-preference', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: next }),
    }).catch(() => {})
  }, [])

  const t = useCallback((english: string, vars?: Record<string, string | number>) => {
    if (lang === 'en') return interpolate(english, vars)
    return interpolate(dictionary[english] ?? english, vars)
  }, [lang, dictionary])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
