import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards the Electron preload packaging bug that froze the UI on "boot sequence…":
 * an ESM .mjs preload built with require("electron") never exposes window.myVpns.
 */
describe('preload packaging', () => {
  it('vite config forces CJS preload output', () => {
    const configPath = path.join(process.cwd(), 'vite.config.ts')
    const src = fs.readFileSync(configPath, 'utf8')
    expect(src).toContain("format: 'cjs'")
    expect(src).toContain("entryFileNames: 'preload.cjs'")
  })

  it('main process resolves preload.cjs first', () => {
    const mainPath = path.join(process.cwd(), 'electron/main.ts')
    const src = fs.readFileSync(mainPath, 'utf8')
    expect(src).toContain("preload.cjs")
    expect(src.indexOf('preload.cjs')).toBeLessThan(src.indexOf('preload.mjs'))
  })
})
