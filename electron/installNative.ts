import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { encodedPowerShell, powershellPath, psQuote, secureDirectory } from './nativeVpn'
import windowsClient from '../packaging/windows-client.json'

const execFileAsync = promisify(execFile)
// Official OpenConnect v9.21 GitLab release-tag artifact, not a moving master build.
export const WINDOWS_CLIENT = windowsClient

export function findBrew(): string | null {
  return ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(p => fs.existsSync(p)) || null
}

export async function installNativeClient(onLog?: (line: string) => void): Promise<{ code: number; output: string }> {
  if (process.platform === 'darwin') {
    const brew = findBrew()
    if (!brew) return { code: 1, output: 'Install Homebrew from https://brew.sh, then run: brew install openfortivpn' }
    onLog?.('brew install openfortivpn (runs as your user, never as root)')
    try {
      const { stdout, stderr } = await execFileAsync(brew, ['install', 'openfortivpn'], { timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, NONINTERACTIVE: '1', PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' } })
      return { code: 0, output: stdout + stderr }
    } catch (err) { return { code: 1, output: err instanceof Error ? err.message : String(err) } }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-install-'))
  const installer = path.join(dir, 'openconnect-installer.exe')
  try {
    await secureDirectory(dir)
    onLog?.('Downloading OpenConnect 9.21 from the official release build…')
    const response = await fetch(WINDOWS_CLIENT.url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`OpenConnect download failed (${response.status}).`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== WINDOWS_CLIENT.sha256) throw new Error('OpenConnect installer checksum mismatch. Refusing to execute it.')
    fs.writeFileSync(installer, bytes, { flag: 'wx' })
    onLog?.('Checksum verified. Approve the Windows administrator prompt to install OpenConnect and Wintun.')
    const { stdout, stderr } = await execFileAsync(powershellPath, encodedPowerShell(
      `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${psQuote(installer)} -ArgumentList '/S' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`),
    { windowsHide: true, timeout: 10 * 60 * 1000 })
    return { code: 0, output: stdout + stderr }
  } catch (err) { return { code: 1, output: err instanceof Error ? err.message : String(err) } }
  finally {
    try { fs.unlinkSync(installer) } catch { /* installer may not have been downloaded */ }
    try { fs.rmdirSync(dir) } catch { /* do not recurse */ }
  }
}
