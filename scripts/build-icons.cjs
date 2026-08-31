// Rasterizes public/icon.svg into the PNG masters used by electron-builder
// (build/icon.png, from which the Windows .ico and macOS .icns are generated)
// and by the renderer fallback (public/icon.png).
// Run with: npx electron scripts/build-icons.cjs
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8')
const targets = [
  { file: path.join(root, 'build', 'icon.png'), size: 512 },
  { file: path.join(root, 'public', 'icon.png'), size: 256 },
]

// Drawing into a canvas keeps the alpha channel, which capturePage() of a
// transparent window does not reliably provide on Windows.
async function render(win, size) {
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const image = new Image(${size}, ${size})
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ${size}
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size})
    return canvas.toDataURL('image/png')
  })()`)
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8">'))
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target.file), { recursive: true })
    fs.writeFileSync(target.file, await render(win, target.size))
    console.log(`wrote ${path.relative(root, target.file)} (${target.size}px)`)
  }
  win.destroy()
  app.exit(0)
})
