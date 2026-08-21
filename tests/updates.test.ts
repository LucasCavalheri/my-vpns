import { describe, expect, it, vi } from 'vitest'
import {
  checkForAppUpdate,
  compareVersions,
  normalizeTag,
} from '../electron/updates'
import {
  BASE_RETRY_DELAY_MS,
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  nextCheckDelayMs,
  retryDelayMs,
  type UpdateScheduleState,
} from '../electron/updateScheduler'

describe('compareVersions', () => {
  it('orders plain semver', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0)
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0)
  })

  it('ignores leading v', () => {
    expect(normalizeTag('v1.0.2')).toBe('1.0.2')
    expect(compareVersions('v1.0.2', '1.0.1')).toBeGreaterThan(0)
  })
})

describe('checkForAppUpdate', () => {
  it('returns update when remote is newer', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/LucasCavalheri/my-vpns/releases/tag/v1.0.2',
        draft: false,
      }),
    })) as unknown as typeof fetch

    const info = await checkForAppUpdate('1.0.1', { fetchImpl })
    expect(info).toEqual({
      current: '1.0.1',
      latest: '1.0.2',
      url: 'https://github.com/LucasCavalheri/my-vpns/releases/tag/v1.0.2',
    })
  })

  it('returns null when already up to date', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://example.com',
        draft: false,
      }),
    })) as unknown as typeof fetch

    expect(await checkForAppUpdate('1.0.2', { fetchImpl })).toBeNull()
  })
})

describe('retryDelayMs', () => {
  it('grows exponentially from the base delay', () => {
    expect(retryDelayMs(1)).toBe(BASE_RETRY_DELAY_MS)
    expect(retryDelayMs(2)).toBe(BASE_RETRY_DELAY_MS * 2)
    expect(retryDelayMs(3)).toBe(BASE_RETRY_DELAY_MS * 4)
  })

  it('clamps to the max retry delay', () => {
    expect(retryDelayMs(16)).toBe(MAX_RETRY_DELAY_MS)
    expect(retryDelayMs(99)).toBe(MAX_RETRY_DELAY_MS)
  })

  it('treats non-positive failure counts as the first retry', () => {
    expect(retryDelayMs(0)).toBe(BASE_RETRY_DELAY_MS)
    expect(retryDelayMs(-3)).toBe(BASE_RETRY_DELAY_MS)
  })
})

describe('nextCheckDelayMs', () => {
  const state = (partial: Partial<UpdateScheduleState>): UpdateScheduleState => ({
    lastAttemptAt: null,
    consecutiveFailures: 0,
    ...partial,
  })

  it('uses a short first delay before any attempt', () => {
    expect(nextCheckDelayMs(state({}))).toBe(FIRST_CHECK_DELAY_MS)
  })

  it('waits the long interval after a successful check', () => {
    expect(
      nextCheckDelayMs(state({ lastAttemptAt: 1000, consecutiveFailures: 0 })),
    ).toBe(CHECK_INTERVAL_MS)
  })

  it('backs off after failures regardless of interval', () => {
    expect(
      nextCheckDelayMs(state({ lastAttemptAt: 1000, consecutiveFailures: 1 })),
    ).toBe(BASE_RETRY_DELAY_MS)
    expect(
      nextCheckDelayMs(state({ lastAttemptAt: 1000, consecutiveFailures: 4 })),
    ).toBe(BASE_RETRY_DELAY_MS * 8)
    expect(
      nextCheckDelayMs(state({ lastAttemptAt: 1000, consecutiveFailures: 9 })),
    ).toBe(MAX_RETRY_DELAY_MS)
  })
})
