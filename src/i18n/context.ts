import { createContext } from 'react'
import type { AppLocale, MessageKey } from './messages'

export interface I18nValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nValue | null>(null)
