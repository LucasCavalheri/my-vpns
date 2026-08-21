import { useCallback, useMemo, type ReactNode } from 'react'
import {
  translate,
  type AppLocale,
  type MessageKey,
} from './messages'
import { I18nContext } from './context'

export function I18nProvider({
  locale,
  setLocale,
  children,
}: {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  children: ReactNode
}) {
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  )
}
