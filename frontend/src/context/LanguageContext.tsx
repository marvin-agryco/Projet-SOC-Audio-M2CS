import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import translations, { Language } from '../i18n/translations'

interface LanguageContextType {
  lang: Language
  toggleLang: () => void
  t: (key: string) => string
  locale: () => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    const stored = localStorage.getItem('soc-lang') as Language
    return stored === 'fr' ? 'fr' : 'en'
  })

  const toggleLang = () => {
    setLang((prev) => {
      const next = prev === 'en' ? 'fr' : 'en'
      localStorage.setItem('soc-lang', next)
      return next
    })
  }

  const t = useCallback(
    (key: string): string => {
      return translations[lang][key] || translations['en'][key] || key
    },
    [lang]
  )

  const locale = useCallback(() => (lang === 'fr' ? 'fr-FR' : 'en-US'), [lang])

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t, locale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
