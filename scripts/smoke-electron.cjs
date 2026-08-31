// Run with: npx electron scripts/smoke-electron.cjs
// Exercises the real compiled main process, preload bridge and renderer without
// installing a VPN client, creating profiles or changing network settings.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(root, '.tmp', 'electron-smoke-')))
process.argv.push('--hidden')
const timer = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1) }, 20000)
import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href).then(() => {
  app.whenReady().then(async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No app window')
      if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
      await new Promise(resolve => setTimeout(resolve, 1500))
      const result = await win.webContents.executeJavaScript(`(async () => {
        if (!window.myVpns) throw new Error('Missing preload bridge');
        const deps = await window.myVpns.getDependencyStatus();
        const settings = await window.myVpns.getSettings();
        return { engine: deps.engine, platform: deps.platform, configDir: deps.configDir,
          clientInstalled: deps.clientInstalled, locale: settings.locale, body: document.body.innerText };
      })()`)
      if (!result.body.trim() || /Boot fault|boot sequence/.test(result.body)) throw new Error(JSON.stringify(result))
      // Give React its asynchronous dependency check before capturing the UI.
      await new Promise(resolve => setTimeout(resolve, 1000))
      try { fs.writeFileSync(path.join(root, '.tmp', 'electron-smoke.png'), (await win.webContents.capturePage()).toPNG()) }
      catch (error) { console.warn('Hidden-window screenshot unavailable:', error.message) }
      console.log(JSON.stringify(result))
      clearTimeout(timer)
      app.exit(0)
    } catch (error) { console.error(error); clearTimeout(timer); app.exit(1) }
  })
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1) })
