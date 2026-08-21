/**
 * Pure scheduling math for the periodic update check.
 *
 * The app checks GitHub Releases shortly after launch and then on a long
 * interval while it sits open or in the tray. Failed attempts back off
 * exponentially so we never hammer the unauthenticated GitHub API
 * (rate limit: 60 req/h/IP).
 */

export interface UpdateScheduleState {
  /** Epoch ms of the last network attempt (null = never attempted). */
  lastAttemptAt: number | null
  /** Consecutive failed attempts since the last success. */
  consecutiveFailures: number
}

/** Delay before the first automatic check after launch. */
export const FIRST_CHECK_DELAY_MS = 10_000

/** Interval between automatic checks after a successful one. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Base delay for the first retry after a failure. */
export const BASE_RETRY_DELAY_MS = 5 * 60 * 1000

/** Upper bound for retries. */
export const MAX_RETRY_DELAY_MS = 60 * 60 * 1000

/** Exponential backoff for `failures` consecutive failures (1-based), capped. */
export function retryDelayMs(failures: number): number {
  const n = Math.max(1, Math.floor(failures))
  const capped = Math.min(n, 16)
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (capped - 1),
    MAX_RETRY_DELAY_MS,
  )
}

/**
 * Milliseconds to wait until the next automatic check,
 * given the current schedule state.
 */
export function nextCheckDelayMs(state: UpdateScheduleState): number {
  if (state.lastAttemptAt === null) return FIRST_CHECK_DELAY_MS
  if (state.consecutiveFailures > 0) {
    return retryDelayMs(state.consecutiveFailures)
  }
  return CHECK_INTERVAL_MS
}
