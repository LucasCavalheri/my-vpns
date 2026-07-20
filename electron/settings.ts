import fs from 'node:fs'
import path from 'node:path'

export type AppLocale = 'en' | 'pt-BR'

export interface AppSettings {
  locale: AppLocale
}

const DEFAULTS: AppSettings = {
  locale: 'en',
}

function settingsPath(): string {
  // Lazy import keeps unit-testability of pure modules elsewhere
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return path.join(app.getPath('userData'), 'settings.json')
}

function detectLocale(): AppLocale {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  const loc = (app.getLocale() || '').toLowerCase()
  if (loc.startsWith('pt')) return 'pt-BR'
  return 'en'
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const locale =
      parsed.locale === 'pt-BR' || parsed.locale === 'en'
        ? parsed.locale
        : detectLocale()
    return { ...DEFAULTS, locale }
  } catch {
    return { ...DEFAULTS, locale: detectLocale() }
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...partial }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
