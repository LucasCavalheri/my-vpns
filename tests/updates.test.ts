import { describe, expect, it, vi } from 'vitest'
import {
  checkForAppUpdate,
  compareVersions,
  normalizeTag,
} from '../electron/updates'

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
