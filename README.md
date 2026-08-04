# 🛡️ My VPNs

**A Linux desktop app for managing OpenFortiVPN (FortiGate SSL) connections.**

No more babysitting a terminal with `sudo openfortivpn`. Connect one or many tunnels, park the app in the tray, get notified when a link drops, and manage profiles without editing files by hand.

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux-blue.svg)](#-installation)
[![Packages](https://img.shields.io/badge/packages-.deb%20%7C%20.rpm-orange.svg)](#-installation)
[![Built with](https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20TypeScript-informational.svg)](#-tech-stack)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)

---

## ✨ Features

| Feature | What it does |
|--------|----------------|
| 🔌 Multi-link connect | Bring up several VPNs at the same time |
| 📝 Profile editor | Create / edit / delete `.conf` files under `/etc/openfortivpn` |
| 📥 Import `.conf` | Pick an existing openfortivpn config and save it |
| 🧺 System tray | Close the window — tunnels keep running |
| 🔔 Notifications | Know immediately when a tunnel goes up or dies |
| ♻️ Auto-reconnect | Optional recovery after unexpected disconnects |
| 🚀 Start with Linux | XDG autostart (`.desktop` in `~/.config/autostart`) |
| 🌐 pt-BR + EN | Full UI language switch, persisted |
| 📦 Dependency bootstrap | If `openfortivpn` is missing, detect distro and install it |
| 📜 Live console | Stream `openfortivpn` output while connected |
| 🔐 PolicyKit auth | Graphical elevation via `pkexec` |

---

## 📸 Screenshots

> 🖼️ *Screenshots / GIF welcome — open a PR!*

---

## 🚀 Installation

### From GitHub Releases (recommended)

1. Open [Releases](https://github.com/LucasCavalheri/my-vpns/releases)
2. Download either:
   - `my-vpns_*_amd64.deb` or `my-vpns-*.x86_64.rpm` — installable packages
   - **Source code** (zip/tar.gz) — always attached by GitHub for every tag/release

#### Debian / Ubuntu / Mint

```bash
sudo apt install ./my-vpns_*_amd64.deb
```

The package installs the signed APT source automatically, so future releases
can be installed with `sudo apt upgrade`.

#### Fedora / RHEL / Rocky / Alma

```bash
sudo dnf install ./my-vpns-*.x86_64.rpm
```

Then launch **My VPNs** from your app menu. Packaged binary typically lives at:

```bash
"/opt/My VPNs/my-vpns"
```

### How to publish a release

**Automatic (preferred):** push a version tag — CI builds `.deb`/`.rpm` and creates the GitHub Release.

```bash
# 1) bump version in package.json (e.g. 1.0.1)
npm version patch   # or: minor / major
# 2) push commit + tag
git push origin master --follow-tags
```

That triggers [`.github/workflows/release.yml`](.github/workflows/release.yml) on tags like `v1.0.1`.

**Manual (from your machine):**

```bash
npm run build
gh release create v1.0.1 \
  release/my-vpns_*_amd64.deb \
  release/my-vpns-*.x86_64.rpm \
  --title "My VPNs v1.0.1" \
  --generate-notes
```

> GitHub always offers **Source code** downloads on the release page for the tagged commit — you don’t upload those yourself.

The release workflow signs the APT repository with the archive key committed at
[`packaging/my-vpns-archive-keyring.asc`](./packaging/my-vpns-archive-keyring.asc).
The matching private key must be configured once as the GitHub Actions secret
`APT_SIGNING_KEY`; it must never be committed to the repository.
The key fingerprint is `A9F137BEE74B623131071358FB0EC1D5A01262F0`.

### Requirements

| Requirement | Notes |
|-------------|--------|
| 🐧 Linux desktop | GNOME, KDE, and friends |
| 🔑 PolicyKit (`pkexec`) | Used for privileged VPN start/stop and profile writes |
| 📁 `/etc/openfortivpn/` | Where profiles live (create, import, or drop files manually) |
| 🛰️ `openfortivpn` | Optional at install time — the app can install it for you |

> **Tip:** On first launch, if `openfortivpn` is not on `PATH`, My VPNs reads `/etc/os-release`, picks the right package manager (`apt`, `dnf`/`yum`, `zypper`, or `pacman`), and offers a one-click install via PolicyKit.

---

## 🧰 VPN profiles

Profiles are standard openfortivpn configs:

```text
/etc/openfortivpn/
  ├── work.conf
  ├── client.conf
  └── lab.conf
```

### Create / import in the app

Use **New profile** or **Import .conf**. The form covers the options used in real FortiGate SSL setups:

| Field | Conf key |
|-------|----------|
| Host / Port | `host`, `port` |
| Username / Password | `username`, `password` |
| Trusted cert | `trusted-cert` |
| DNS / routes | `set-dns`, `set-routes` |
| Realm | `realm` (optional) |
| Persistent | `persistent` (seconds, `0` = off) |

Example file:

```ini
host = vpn.example.com
port = 10443
username = alice
password = hunter2
trusted-cert = <sha256 fingerprint>
set-dns = 0
set-routes = 1
```

### Privacy notes

- 🔒 Credentials are stored in the `.conf` files under `/etc/openfortivpn` (same model as CLI openfortivpn)
- 👁️ The main list shows host/port/username — not the password
- 🧾 Harden directory permissions on shared machines (`chmod` / root-only reads as needed)
- 🚫 Never commit personal `.conf` files or passwords to git

---

## 🎮 Usage

1. Open **My VPNs**
2. Create, import, or pick an existing profile
3. Click **Bring up** / **Conectar** and approve the PolicyKit prompt
4. Optionally enable **Auto-relink**, **Start with Linux**, and switch **PT / EN**
5. Close the window anytime — it keeps running in the tray
6. Fully quit from the tray menu

### Tray menu

- Show window
- Per-profile connect / disconnect
- Disconnect all
- Refresh profiles
- Quit

---

## 🛠️ Development

### Prerequisites

- Node.js **22+** (recommended)
- npm
- Linux desktop session (Wayland or X11)
- For RPM builds: `rpm` / `rpmbuild` (`sudo apt install rpm` on Debian/Ubuntu)

### Setup

```bash
git clone https://github.com/LucasCavalheri/my-vpns.git
cd my-vpns
npm install
npm run dev
```

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Electron + Vite hot reload |
| `npm test` | Run unit tests |
| `npm run build` | Typecheck, bundle, and build **`.deb` + `.rpm`** |
| `npm run build:deb` | Build Debian package only |
| `npm run build:rpm` | Build RPM package only |
| `npm run lint` | Run oxlint |

Artifacts land in `release/` (gitignored).

---

## 🧪 Tests

```bash
npm test
```

Coverage includes:

- `/etc/os-release` parsing + package-family detection
- openfortivpn install plan per distro
- VPN `.conf` parse / serialize (including profile drafts)
- Log markers for tunnel up / errors
- Preload packaging guard (CJS bridge)
- i18n catalog key parity (`en` ↔ `pt-BR`)
- XDG autostart `.desktop` snippet

---

## 🏗️ Project structure

```text
my-vpns/
├── electron/           # Main process
│   ├── main.ts         # Window, tray, IPC
│   ├── preload.ts      # contextBridge API
│   ├── vpn.ts          # Multi-session VPN manager
│   ├── profiles.ts     # Create / import / save / delete .conf
│   ├── deps.ts         # Distro detect + openfortivpn install
│   ├── autostart.ts    # XDG autostart
│   └── settings.ts     # Locale persistence
├── src/                # React UI
│   ├── App.tsx
│   ├── components/     # SetupGate, ProfileEditor
│   ├── i18n/           # en + pt-BR messages
│   └── types.ts
├── packaging/          # Helpers + PolicyKit + deb/rpm scripts
├── tests/              # Vitest unit tests
├── build/              # App icon
└── release/            # Built packages (generated, not committed)
```

### Under the hood

1. Profiles are discovered from `/etc/openfortivpn/*.conf`
2. Connect runs through PolicyKit helpers (`/usr/lib/my-vpns/` after package install)
3. Multiple tunnels are tracked as independent sessions
4. Profile writes use `pkexec install` into `/etc/openfortivpn`
5. Status changes drive tray + desktop notifications

Installed helper paths:

| Path | Role |
|------|------|
| `/usr/lib/my-vpns/run-vpn.sh` | Starts `openfortivpn` and tracks PID |
| `/usr/lib/my-vpns/stop-vpn.sh` | Stops the tunnel gracefully |
| `/usr/share/polkit-1/actions/dev.cavallheri.myvpns.policy` | PolicyKit action (`auth_admin_keep`) |

---

## 🧱 Tech stack

- ⚡ **Electron** — desktop shell, tray, notifications, dialogs
- ⚛️ **React 19** + **TypeScript** — UI
- 🌀 **Vite** — fast dev & bundling
- 🎨 **Tailwind CSS v4** — styling
- 📦 **electron-builder** — `.deb` / `.rpm` packaging
- 🧪 **Vitest** — unit tests
- 🔐 **PolicyKit** — privilege elevation without a permanent root shell

---

## 🤝 Contributing

Contributions are very welcome — bug fixes, UI polish, distro support, docs, packaging, tests, translations.

### Quick start

1. 🍴 Fork the repo
2. 🌿 Create a branch: `git checkout -b feat/my-idea`
3. 🧪 Smoke-test with `npm run dev`
4. ✅ Ensure `npm test`, `npm run lint`, and `npx tsc -b` pass
5. 📨 Open a Pull Request with a clear *why*

### Good first issues

- Screenshots / GIF for this README
- GitHub Actions release pipeline for `.deb` / `.rpm`
- Stronger connection health checks
- Flatpak / AppImage experiments
- Extra openfortivpn options in the profile form

### Code style

- Keep changes focused — small, reviewable PRs
- Match existing TypeScript / React patterns
- Don’t commit secrets, VPN passwords, or personal `.conf` files
- Don’t add drive-by refactors unrelated to your PR

### Reporting bugs

Please include:

- Distro + desktop environment (`cat /etc/os-release`)
- App version / commit
- Whether `openfortivpn` is installed (`openfortivpn --version`)
- Steps to reproduce + relevant console output (**redact credentials**)

---

## 🗺️ Roadmap

- [x] pt-BR + EN i18n
- [x] Create / import / edit profiles
- [x] Multi-VPN concurrent sessions
- [x] Start with Linux (autostart)
- [x] GitHub Actions release pipeline (tag → `.deb` / `.rpm`)
- [ ] Stronger health checks / richer log parsing
- [ ] Flatpak / AppImage experiments

Have a better idea? Open an issue or PR 💬

---

## ⚠️ Security

- Elevated privileges are required to create VPN tunnels and write under `/etc/openfortivpn` — expected
- Elevation goes through **PolicyKit**, not a setuid binary
- Review `/etc/openfortivpn/*.conf` permissions on shared machines
- Never paste passwords into issues or PRs

If you find a security issue, please report it privately when possible instead of opening a public issue with exploit details.

---

## 📄 License

Released under the [MIT License](./LICENSE).

---

## 💜 Acknowledgements

- [openfortivpn](https://github.com/adrienverge/openfortivpn) — the VPN engine
- Everyone who is tired of leaving a root terminal open forever

---

<p align="center">
  <strong>Made for Linux people who just want the tunnel up. 🛡️✨</strong><br/>
  <sub>Star the repo if it helps — it keeps the project visible for new contributors.</sub>
</p>
