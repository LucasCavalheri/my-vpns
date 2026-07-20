import { describe, expect, it } from 'vitest'
import {
  buildAutostartDesktopEntry,
} from '../electron/autostart'

// Pure helpers tested without Electron app lifecycle
describe('autostart desktop entry', () => {
  it('writes a valid XDG autostart snippet', () => {
    const entry = buildAutostartDesktopEntry('"/opt/My VPNs/my-vpns" --hidden')
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Type=Application')
    expect(entry).toContain('Name=My VPNs')
    expect(entry).toContain('Exec="/opt/My VPNs/my-vpns" --hidden')
    expect(entry).toContain('X-GNOME-Autostart-enabled=true')
  })
})
