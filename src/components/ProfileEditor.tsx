import { useEffect, useState, type ReactNode } from 'react'
import type { VpnProfileDraft } from '../types'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  mode: 'create' | 'edit' | 'import'
  initial: VpnProfileDraft
  busy: boolean
  error: string | null
  onClose: () => void
  onSave: (draft: VpnProfileDraft) => void
}

export function ProfileEditor({
  mode,
  initial,
  busy,
  error,
  onClose,
  onSave,
}: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<VpnProfileDraft>(initial)

  useEffect(() => {
    setDraft(initial)
  }, [initial])

  function patch<K extends keyof VpnProfileDraft>(
    key: K,
    value: VpnProfileDraft[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const title =
    mode === 'edit'
      ? t('form.editTitle')
      : mode === 'import'
        ? t('form.importTitle')
        : t('form.createTitle')

  return (
    <div className="absolute inset-0 z-20 flex items-stretch bg-ink/40 p-4 backdrop-blur-[1px]">
      <form
        className="stamp-in flex w-full flex-col border-2 border-ink bg-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
        }}
      >
        <div className="flex items-end justify-between border-b-2 border-ink bg-flare px-5 py-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.28em] uppercase">
              openfortivpn · .conf
            </p>
            <h2 className="mt-1 text-3xl leading-none font-extrabold tracking-[-0.03em]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-ink bg-sheet px-3 py-2 font-mono text-xs tracking-[0.16em] uppercase"
          >
            {t('form.cancel')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto console-scroll px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('form.id')} hint={t('form.idHint')}>
              <input
                required
                disabled={mode === 'edit'}
                value={draft.id}
                onChange={(e) => patch('id', e.target.value)}
                className="field-input"
                placeholder="tecsul"
              />
            </Field>

            <Field label={t('form.host')}>
              <input
                required
                value={draft.host}
                onChange={(e) => patch('host', e.target.value)}
                className="field-input"
                placeholder="vpn.example.com"
              />
            </Field>

            <Field label={t('form.port')}>
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={draft.port}
                onChange={(e) =>
                  patch('port', Number.parseInt(e.target.value, 10) || 443)
                }
                className="field-input"
              />
            </Field>

            <Field label={t('form.username')}>
              <input
                value={draft.username}
                onChange={(e) => patch('username', e.target.value)}
                className="field-input"
                autoComplete="username"
              />
            </Field>

            <Field label={t('form.password')} hint={t('form.passwordHint')}>
              <input
                type="password"
                value={draft.password}
                onChange={(e) => patch('password', e.target.value)}
                className="field-input"
                autoComplete="new-password"
              />
            </Field>

            <Field label={t('form.realm')} hint={t('form.optional')}>
              <input
                value={draft.realm}
                onChange={(e) => patch('realm', e.target.value)}
                className="field-input"
              />
            </Field>

            <Field
              label={t('form.trustedCert')}
              hint={t('form.trustedCertHint')}
              className="md:col-span-2"
            >
              <input
                value={draft.trustedCert}
                onChange={(e) => patch('trustedCert', e.target.value)}
                className="field-input font-mono text-sm"
                placeholder="sha256 digest…"
              />
            </Field>

            <Field label={t('form.persistent')} hint={t('form.persistentHint')}>
              <input
                type="number"
                min={0}
                value={draft.persistent}
                onChange={(e) =>
                  patch('persistent', Number.parseInt(e.target.value, 10) || 0)
                }
                className="field-input"
              />
            </Field>

            <div className="flex flex-col justify-end gap-3 border-2 border-ink bg-paper px-4 py-3 font-mono text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-flare"
                  checked={draft.setRoutes}
                  onChange={(e) => patch('setRoutes', e.target.checked)}
                />
                {t('form.setRoutes')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-flare"
                  checked={draft.setDns}
                  onChange={(e) => patch('setDns', e.target.checked)}
                />
                {t('form.setDns')}
              </label>
            </div>
          </div>

          {error && (
            <p className="mt-4 border-2 border-fault bg-fault/10 px-3 py-2 font-mono text-sm text-fault">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t-2 border-ink px-5 py-4">
          <button
            type="submit"
            disabled={busy}
            className="border-2 border-ink bg-flare px-5 py-3 font-mono text-sm tracking-[0.16em] uppercase disabled:opacity-40"
          >
            {busy ? t('form.saving') : t('form.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border-2 border-ink bg-sheet px-5 py-3 font-mono text-sm tracking-[0.16em] uppercase"
          >
            {t('form.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[11px] tracking-[0.16em] text-mute uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-mute">{hint}</span>}
    </label>
  )
}
