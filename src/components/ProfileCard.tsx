import { LoaderCircle, Pencil, Power, Trash2 } from 'lucide-react'
import type { VpnProfile, VpnSession } from '../types'
import { useI18n } from '../i18n/useI18n'

interface Props {
  profile: VpnProfile
  session: VpnSession | undefined
  uptime: string | null
  index: number
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ProfileCard({
  profile,
  session,
  uptime,
  index,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useI18n()
  const status = session?.status ?? 'disconnected'
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  const errored = status === 'error'
  const on = connected || connecting

  const dotClass = connected
    ? 'bg-live'
    : connecting
      ? 'bg-hold animate-pulse'
      : errored
        ? 'bg-fault'
        : 'bg-line-strong'

  return (
    <li
      className={`fade-up relative overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5 ${
        connected
          ? 'border-live/35 bg-live-soft'
          : errored
            ? 'border-fault/35 bg-fault-soft'
            : 'border-line bg-surface hover:border-line-strong'
      }`}
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className={`size-2 shrink-0 rounded-full ${dotClass}`} />
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              {profile.name}
            </h2>
            {connected && uptime && (
              <span className="rounded-full border border-live/30 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-live uppercase">
                {t('profiles.live', { uptime })}
              </span>
            )}
            {connecting && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hold/30 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-hold uppercase">
                <LoaderCircle className="size-3 animate-spin" />
                {t('profiles.handshake')}
              </span>
            )}
          </div>

          <p className="mt-1.5 truncate font-mono text-xs text-muted">
            {profile.host}:{profile.port}
            <span className="mx-1.5 opacity-40">·</span>
            {profile.username || t('profiles.noUser')}
            <span className="mx-1.5 opacity-40">·</span>
            routes {profile.setRoutes ? 'on' : 'off'}
            <span className="mx-1.5 opacity-40">·</span>
            dns {profile.setDns ? 'on' : 'off'}
          </p>

          {session?.message && status !== 'disconnected' && (
            <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted">
              {session.message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            title={t('profiles.edit')}
            aria-label={`${t('profiles.edit')} ${profile.name}`}
            className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={t('profiles.delete')}
            aria-label={`${t('profiles.delete')} ${profile.name}`}
            className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-fault/40 hover:bg-fault-soft hover:text-fault"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={connecting}
            onClick={onToggle}
            className={`ml-1 inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              on
                ? 'border border-fault/30 bg-fault-soft text-fault hover:border-fault hover:bg-fault hover:text-white'
                : 'bg-accent text-white shadow-sm shadow-accent/25 hover:bg-accent-hover'
            }`}
          >
            <Power className="size-4" />
            {on ? t('profiles.killLink') : t('profiles.bringUp')}
          </button>
        </div>
      </div>
    </li>
  )
}
