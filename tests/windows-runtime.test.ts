import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import { createHash, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildOpenConnectPlan, certificatePublicKeyPin } from '../electron/openconnect'
import { encodedPowerShell, powershellPath, psQuote } from '../electron/nativeVpn'

const bin = process.env.MYVPNS_TEST_OPENCONNECT || path.resolve('.tmp/openconnect/openconnect.exe')
const available = process.platform === 'win32' && fs.existsSync(bin)
if (process.env.MYVPNS_TEST_OPENCONNECT && !available) throw new Error('Configured OpenConnect test executable is missing.')

function startSupervisor(dir: string) {
  const inner = encodedPowerShell(`& ${psQuote(path.resolve('packaging/windows-vpn.ps1'))} -SessionDir ${psQuote(dir)} -TestClient ${psQuote(bin)}`).join(' ')
  // Match the production hidden-console boundary, omitting only UAC because
  // these tests never create a tunnel or alter system network settings.
  return spawn(powershellPath, encodedPowerShell(`$p = Start-Process -FilePath ${psQuote(powershellPath)} -ArgumentList ${psQuote(inner)} -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`), { windowsHide: true })
}

describe.skipIf(!available)('real Windows OpenConnect supervisor (localhost only)', () => {
  it('transmits an imported .conf login over TLS, preserves realm and special characters, and reports auth failure', async () => {
    const cert = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-cert.pem'))
    const key = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-key.pem'))
    const raw = new X509Certificate(cert).raw
    const pin = createHash('sha256').update(raw).digest('hex')
    const bodies: URLSearchParams[] = []
    const server = https.createServer({ key, cert }, (req, res) => {
      if (req.url?.startsWith('/remote/logincheck')) {
        let body = ''
        req.on('data', data => { body += data.toString() })
        req.on('end', () => { bodies.push(new URLSearchParams(body)); res.writeHead(405); res.end('Denied') })
      } else if (!req.url?.startsWith('/remote/login')) {
        res.writeHead(302, { Location: '/remote/login?realm=My%20Realm' }); res.end()
      } else { res.end('<html>Test login</html>') }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-runtime-test-'))
    const port = (server.address() as { port: number }).port
    const secret = 'test password $`"&=with spaces çã漢字'
    const plan = buildOpenConnectPlan(`host=127.0.0.1\nport=${port}\nusername=DOMAIN\\alice\npassword=${secret}\nrealm=My Realm\ntrusted-cert=${pin}\nset-dns=0`)
    plan.args.unshift(`--servercert=${certificatePublicKeyPin(raw, [pin])}`)
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ ...plan, bin }))
    fs.writeFileSync(path.join(dir, 'heartbeat'), '')
    let output = ''
    const child = startSupervisor(dir)
    child.stdout.on('data', b => { output += b.toString() })
    child.stderr.on('data', b => { output += b.toString() })
    const timer = setTimeout(() => { fs.writeFileSync(path.join(dir, 'stop'), '') }, 20000)
    try {
      await new Promise<void>((resolve, reject) => { child.once('close', () => resolve()); child.once('error', reject) })
      const stderr = fs.existsSync(path.join(dir, 'stderr.log')) ? fs.readFileSync(path.join(dir, 'stderr.log'), 'utf8') : ''
      expect(bodies.length, output + stderr).toBeGreaterThan(0)
      expect(bodies[0].get('username')).toBe('DOMAIN\\alice')
      expect(bodies[0].get('credential')).toBe(secret)
      expect(bodies[0].get('realm')).toBe('My Realm')
      expect(fs.existsSync(path.join(dir, 'job.json'))).toBe(false)
      expect(fs.readFileSync(path.join(dir, 'exit-code'), 'utf8').trim()).not.toBe('0')
      expect(stderr).not.toContain(secret)
    } finally {
      clearTimeout(timer)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name))
      fs.rmdirSync(dir)
    }
  }, 40000)

  it('gracefully cancels a client waiting on a server, without killing its supervisor', async () => {
    const cert = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-cert.pem'))
    const key = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-key.pem'))
    const raw = new X509Certificate(cert).raw
    const digest = createHash('sha256').update(raw).digest('hex')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-cancel-test-'))
    let requested = false
    let cancelAt = 0
    const server = https.createServer({ key, cert }, () => {
      requested = true
      cancelAt = Date.now()
      fs.writeFileSync(path.join(dir, 'stop'), '')
      // Deliberately never return an HTTP response.
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const plan = buildOpenConnectPlan(`host=127.0.0.1\nport=${port}\nusername=test\npassword=test\nset-dns=0`)
    plan.args.unshift(`--servercert=${certificatePublicKeyPin(raw, [digest])}`)
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ ...plan, bin }))
    fs.writeFileSync(path.join(dir, 'heartbeat'), '')
    const child = startSupervisor(dir)
    child.stdout.resume()
    child.stderr.resume()
    const timer = setTimeout(() => fs.writeFileSync(path.join(dir, 'stop'), ''), 15000)
    try {
      await new Promise<void>((resolve, reject) => { child.once('close', () => resolve()); child.once('error', reject) })
      expect(requested).toBe(true)
      expect(Date.now() - cancelAt).toBeLessThan(10000)
      expect(fs.readFileSync(path.join(dir, 'stderr.log'), 'utf8')).not.toContain('forcing exit')
      expect(fs.existsSync(path.join(dir, 'exit-code'))).toBe(true)
    } finally {
      clearTimeout(timer)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name))
      fs.rmdirSync(dir)
    }
  }, 40000)
})
