import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { VpnProfileDraft } from '../types'
import { useI18n } from '../i18n/useI18n'

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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <form
        className="fade-up flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              openfortivpn · .conf
            </p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('form.cancel')}
            title={t('form.cancel')}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="console-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {Boolean(draft.extraOptions?.length) && (
            <p className="mb-4 text-xs text-muted">{t('form.extraOptions', { count: draft.extraOptions!.length })}</p>
          )}
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
                className="field-input text-xs"
                placeholder="sha256 digest…"
              />
            </Field>

            <Field label={t('form.healthHost')} hint={t('form.healthHint')}>
              <input value={draft.healthHost || ''} onChange={(e) => patch('healthHost', e.target.value)} className="field-input" placeholder="198.18.0.2" />
            </Field>
            <Field label={t('form.healthPort')}>
              <input type="number" min={1} max={65535} value={draft.healthPort || ''} onChange={(e) => patch('healthPort', Number(e.target.value) || undefined)} className="field-input" />
            </Field>

            <label className="flex items-center gap-2 rounded-lg border border-line bg-app px-4 py-3 text-sm font-medium md:col-span-2">
              <input type="checkbox" className="accent-accent" checked={Boolean(draft.noDtls)} onChange={(e) => patch('noDtls', e.target.checked)} />
              <span>{t('form.noDtls')}<span className="ml-2 text-xs font-normal text-muted">{t('form.noDtlsHint')}</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-accent" checked={Boolean(draft.legacyTunnel)} onChange={(e) => patch('legacyTunnel', e.target.checked)} />
              <span>{t('form.legacyTunnel')}<span className="ml-2 text-xs font-normal text-muted">{t('form.legacyTunnelHint')}</span></span>
            </label>

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

            <div className="flex flex-col justify-end gap-3 rounded-lg border border-line bg-app px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={draft.setRoutes}
                  onChange={(e) => patch('setRoutes', e.target.checked)}
                />
                {t('form.setRoutes')}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={draft.setDns}
                  onChange={(e) => patch('setDns', e.target.checked)}
                />
                {t('form.setDns')}
              </label>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-fault/25 bg-fault-soft px-3 py-2 font-mono text-xs break-all text-fault">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 border-t border-line px-5 py-4">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t('form.saving') : t('form.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
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
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}
