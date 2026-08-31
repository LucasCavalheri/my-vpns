import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { powershellPath } from '../electron/nativeVpn'
const execFileAsync = promisify(execFile)

async function network(dns: number, routes: number, flag?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-network-test-'))
  const dir = path.join(root, 'session-test')
  fs.mkdirSync(dir)
  try {
    const { stdout } = await execFileAsync(powershellPath, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.resolve('tests/fixtures/network-harness.ps1'), '-SessionDir', dir, '-Dns', String(dns), '-Routes', String(routes), ...(flag ? [flag] : [])],
    { windowsHide: true, timeout: 20000 })
    return JSON.parse(stdout.trim()) as { connected: string[]; operations: { action: string; servers?: string[]; prefix?: string }[];
      remaining: { prefix: string }[]; duplicateCleanupChanges: number; stateExists: boolean }
  } finally {
    for (const folder of fs.readdirSync(root)) {
      const child = path.join(root, folder)
      for (const file of fs.readdirSync(child)) fs.unlinkSync(path.join(child, file))
      fs.rmdirSync(child)
    }
    fs.rmdirSync(root)
  }
}

describe.skipIf(process.platform !== 'win32')('Windows networking helper with mocked OS cmdlets', () => {
  it.each([[0, 0], [0, 1], [1, 0], [1, 1]])('honors set-dns=%i and set-routes=%i and rolls back only its own changes', async (dns, routes) => {
    const result = await network(dns, routes)
    expect(result.connected).toContain('MYVPNS_TUNNEL_UP')
    const dnsWrites = result.operations.filter(op => op.action === 'dns')
    expect(dnsWrites).toHaveLength(dns ? 2 : 0)
    if (dns) expect(dnsWrites[1].servers).toEqual(['192.0.2.53'])
    expect(result.operations.filter(op => op.action === 'route-add')).toHaveLength(routes ? 2 : 0)
    expect(result.remaining).toEqual([])
    expect(result.duplicateCleanupChanges).toBe(0)
    expect(result.stateExists).toBe(false)
  })

  it('rolls back partial setup and never reports connected when a route fails', async () => {
    const result = await network(1, 1, '-FailRoute')
    expect(result.connected).not.toContain('MYVPNS_TUNNEL_UP')
    expect(result.remaining).toEqual([])
    expect(result.stateExists).toBe(false)
  })

  it('retains a transport route still needed by another active VPN', async () => {
    const result = await network(1, 1, '-Shared')
    expect(result.remaining.map(r => r.prefix)).toEqual(['203.0.113.5/32'])
  })

  it('removes owned routes when Windows TEMP uses short 8.3 path aliases', async () => {
    const result = await network(1, 1, '-ShortPath')
    expect(result.connected).toContain('MYVPNS_TUNNEL_UP')
    expect(result.operations.filter(op => op.action === 'route-remove')).toHaveLength(2)
    expect(result.remaining).toEqual([])
    expect(result.stateExists).toBe(false)
  })
})
