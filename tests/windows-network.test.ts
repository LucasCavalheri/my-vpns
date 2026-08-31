import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { powershellPath } from '../electron/nativeVpn'
const execFileAsync = promisify(execFile)

async function network(dns: number, routes: number, ...flags: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-network-test-'))
  const dir = path.join(root, 'session-test')
  fs.mkdirSync(dir)
  try {
    const { stdout } = await execFileAsync(powershellPath, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.resolve('tests/fixtures/network-harness.ps1'), '-SessionDir', dir, '-Dns', String(dns), '-Routes', String(routes), ...flags],
    { windowsHide: true, timeout: 20000 })
    return JSON.parse(stdout.trim()) as { connected: string[]; operations: { action: string; servers?: string[]; prefix?: string; value?: number; namespaces?: string[] }[];
      ready: { ok: boolean; message: string }; health: { ok: boolean; category?: string }; brokenHealth: { ok: boolean; message: string }; effectiveMtu: number; remainingNrpt: {Name: string}[];
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

describe.skipIf(process.platform !== 'win32')('Windows networking helper with mocked OS cmdlets', { timeout: 25000 }, () => {
  it('keeps the tunnel connected through transient service failures, but stops on topology loss', async () => {
    const { stdout } = await execFileAsync(powershellPath, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tests/fixtures/health-policy-harness.ps1')], { windowsHide: true, timeout: 20000 })
    const result = JSON.parse(stdout.trim())
    expect(result.sequence.map((d: { phase: string }) => d.phase)).toEqual(['connected', 'connected', 'connected', 'connected', 'connected', 'connected'])
    expect(result.sequence.map((d: { failures: number }) => d.failures)).toEqual([1, 2, 0, 1, 2, 3])
    expect(result.networkLoss.phase).toBe('disconnected')
    expect(result.starting.phase).toBe('waiting')
    expect(result.startupExpired.phase).toBe('disconnected')
  })

  it('distinguishes a failed service probe from invalid adapter/IP/routes/MTU', async () => {
    const result = await network(1, 1, '-ServiceFailure')
    expect(result.health).toMatchObject({ ok: false, category: 'service' })
    expect(result.ready.ok).toBe(true)
    expect(result.stateExists).toBe(false)
  })
  it.each([[0, 0], [0, 1], [1, 0], [1, 1]])('honors set-dns=%i and set-routes=%i and rolls back only its own changes', async (dns, routes) => {
    const result = await network(dns, routes)
    expect(result.connected).toContain('MYVPNS_NETWORK_READY')
    expect(result.health.ok).toBe(true)
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
    expect(result.connected).not.toContain('MYVPNS_NETWORK_READY')
    expect(result.remaining).toEqual([])
    expect(result.stateExists).toBe(false)
  })

  it('retains a transport route still needed by another active VPN', async () => {
    const result = await network(1, 1, '-Shared')
    expect(result.remaining.map(r => r.prefix)).toEqual(['203.0.113.5/32'])
  })

  it('does not remove a route that existed before the VPN session', async () => {
    const result = await network(1, 1, '-Preexisting')
    expect(result.remaining.map(r => r.prefix)).toEqual(['198.18.0.0/24'])
    expect(result.operations.filter(op => op.action === 'route-remove')).toHaveLength(1)
  })

  it('removes owned routes when Windows TEMP uses short 8.3 path aliases', async () => {
    const result = await network(1, 1, '-ShortPath')
    expect(result.connected).toContain('MYVPNS_NETWORK_READY')
    expect(result.operations.filter(op => op.action === 'route-remove')).toHaveLength(2)
    expect(result.remaining).toEqual([])
    expect(result.stateExists).toBe(false)
  })

  it.each([1351, 1280, 1400])('applies negotiated MTU %i before IP/routes and restores the original MTU', async (mtu) => {
    const result = await network(1, 1, '-Mtu', String(mtu))
    expect(result.operations[0]).toEqual({ action: 'mtu', value: mtu })
    expect(result.operations.filter(op => op.action === 'mtu').map(op => op.value)).toEqual([mtu, 65535])
    expect(result.health.ok).toBe(true)
    expect(result.effectiveMtu).toBe(65535)
  })

  it.each([['-RejectMtu'], ['-Mtu', '0'], ['-Mtu', '65536']])('fails closed when MTU cannot be safely applied: %s', async (...flags) => {
    const result = await network(1, 1, ...flags)
    expect(result.connected).not.toContain('MYVPNS_NETWORK_READY')
    expect(result.operations.filter(op => ['ip-add', 'route-add'].includes(op.action))).toEqual([])
    expect(result.stateExists).toBe(false)
  })

  it.each(['adapter', 'interface', 'route', 'ip', 'mtu'])('detects a lost or incompatible %s after connection', async (drop) => {
    const result = await network(1, 1, '-Drop', drop)
    expect(result.health.ok).toBe(true)
    expect(result.brokenHealth.ok).toBe(false)
    expect(result.brokenHealth.message).toMatch(/absent|missing|usable|mismatch|disconnected/)
    expect(result.stateExists).toBe(false)
  })

  it('uses domain-specific NRPT instead of changing global DNS, and removes its policy on disconnect', async () => {
    const result = await network(1, 1, '-SplitDns')
    expect(result.ready.ok).toBe(true)
    expect(result.operations.find(op => op.action === 'nrpt-add')).toMatchObject({ namespaces: ['corp.test', '.corp.test'], servers: ['198.18.0.53'] })
    expect(result.operations.filter(op => op.action === 'dns')).toEqual([])
    expect(result.operations.filter(op => op.action === 'nrpt-remove')).toHaveLength(1)
    expect(result.remainingNrpt).toEqual([])
  })

  it('refuses a conflicting DNS policy without replacing or deleting it', async () => {
    const result = await network(1, 1, '-SplitDns', '-DnsConflict')
    expect(result.ready.ok).toBe(false)
    expect(result.ready.message).toContain('Conflicting DNS policy')
    expect(result.remainingNrpt.map(r => r.Name)).toEqual(['preexisting'])
  })
})
