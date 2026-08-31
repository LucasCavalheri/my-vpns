# Platform support

The UI, profile editor and `.conf` files are shared. Execution, privilege elevation, networking and autostart are platform specific.

| Platform | VPN engine | Installer | Profile directory |
| --- | --- | --- | --- |
| Linux | openfortivpn | `.deb`, `.rpm` | `/etc/openfortivpn` (existing location) |
| macOS | openfortivpn from Homebrew | `.dmg`, `.zip`; arm64 and x64 | `~/Library/Application Support/My VPNs/profiles` |
| Windows | official OpenConnect 9.21 with Wintun | NSIS `.exe`; x64 | `%APPDATA%\My VPNs\profiles` |

The new platforms must pass the native acceptance checklist below before they are considered validated for production. The code and packaging being present do not establish compatibility with every FortiGate or authentication policy.

## Configuration compatibility

Files remain **openfortivpn `.conf` files**, including on Windows. Do not feed these files directly to OpenConnect's `--config`: that is a different format. My VPNs translates them at connection time.

| Existing field | Windows behavior |
| --- | --- |
| `host`, `port` | Fortinet HTTPS gateway |
| `username` / `user`, `password` | User argument; password delivered to an isolated hidden Unicode console, never command-line arguments |
| `trusted-cert` | Verify the full SHA256 **certificate** fingerprint in a credential-free TLS probe, then derive an OpenConnect SPKI pin; a mismatch aborts before login |
| `set-dns` | Apply VPN DNS/suffix and interface metric only when enabled; restore previous values on disconnect |
| `set-routes` | Apply split routes, or a full IPv4 tunnel when the gateway sends no split routes; preserve the transport route to the public gateway |
| `realm` | URL-encoded Fortinet login realm |
| `persistent` | My VPNs retries after the configured interval; authentication failures and certificate errors do not retry automatically |
| `ca-file`, `user-cert`, `user-key` | OpenConnect CA / client certificate / private-key options; referenced files must exist on the destination computer |
| `otp` | Supply an additional one-time code as console input; interactive challenge variants still require gateway validation |

When `trusted-cert` is absent, OpenConnect uses normal CA and hostname verification. No option disables certificate verification. Multiple trusted fingerprints are retained during import and editing.

Options not exposed by the form are preserved in `extraOptions`, rather than silently discarded. Windows rejects unrecognized options with their names before elevation. macOS also rejects options that can load executable pppd plugins, run arbitrary pinentry programs or redirect privileged logs. An imported Linux profile containing these options remains intact but requires a platform-specific edit.

The initial Windows backend configures IPv4 tunnels (`--disable-ipv6`). Fortinet support in OpenConnect is described as experimental upstream. This is FortiGate **SSL VPN**, not IPsec. SAML/browser login, all MFA challenge variants, IPv6 tunnels and arbitrary openfortivpn/pppd settings are not claimed as verified Windows features.

## Process and network lifecycle

The Electron UI never runs as administrator/root. Each native connection starts a supervisor after an OS authorization prompt. Windows uses PowerShell and macOS uses `osascript` plus a Bash supervisor. Profiles and temporary credentials are restricted to the current user and privileged accounts. The Linux PolicyKit flow remains in place.

Each Windows connection uses a distinct Wintun interface. The network script records only changes it owns, restores previous DNS, suffix and interface metric, and removes its own IP/routes. A global mutex serializes changes; shared transport routes are retained while another My VPNs session needs them. Network setup failure triggers rollback instead of reporting a successful tunnel.

macOS registers a per-session DNS entry in SystemConfiguration via `scutil`, instead of editing `/etc/resolv.conf`. openfortivpn manages PPP and routing. The entry is removed on exit. This path needs validation on actual supported macOS releases, including multiple simultaneous VPNs.

Supervisors observe a heartbeat. Closing the window keeps the app in the tray; quitting the app requests graceful VPN shutdown. If the app crashes, a supervisor detects the missing heartbeat after about 15 seconds and disconnects. Windows sends Ctrl+C so OpenConnect can log out and run cleanup; after a timeout it forces termination and retries network cleanup. No process is stopped by a broad executable-name match on the new platforms.

## Distribution

Run `npm run build:win` on Windows for the NSIS installer. Run `npm run build:mac` on macOS for both CPU architectures. `npm run build` packages for the current host. Linux's dedicated `build:deb` and `build:rpm` scripts remain available.

The release workflow builds native packages on Windows and macOS runners, then combines them with the Linux artifacts in the GitHub Release. Tags with a version suffix such as `v1.1.0-beta.1` create a pre-release without replacing the latest stable release or publishing to APT. Stable releases retain the existing signed APT repository publishing flow. The CI workflow tests all three operating systems on PRs and master pushes; tests that invoke Windows cmdlets run only on Windows.

The OpenConnect download URL and SHA256 are pinned in `packaging/windows-client.json`. The same metadata is used for installation and the extracted test client. The installer includes Wintun and its DLL dependencies. My VPNs does not redistribute those binaries inside its own installer. If the official artifact expires or changes, download/verification fails closed; update the reviewed metadata rather than removing the hash check.

macOS signing/notarization uses electron-builder's `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` secrets. Windows signing likewise needs the maintainer's appropriate signing credentials/configuration. Without credentials, build artifacts are for manual testing and may be blocked or warned about by Gatekeeper/SmartScreen. Never disable those protections globally to install a test build.

## Verification

Automated checks include configuration translation and preservation; path traversal and newline injection rejection; an actual local TLS handshake for certificate pin conversion; and Windows network command tests covering every DNS/routes toggle combination, partial setup rollback, repeated cleanup and shared transport routes.

On Windows, `scripts/prepare-windows-test.ps1` extracts the pinned official OpenConnect binary without installing it. The runtime tests execute the real client and supervisor against a localhost HTTPS server to verify username/password/realm handling (including non-ASCII passwords), authentication failure and graceful cancellation. They **do not** prove PPP negotiation or real network connectivity.

`npx electron scripts/smoke-electron.cjs`, after `npm run build:bundle`, checks the real Electron main process, preload bridge, dependency detection and rendered setup screen. It does not install dependencies or touch system networking.

Native acceptance checklist (requires a test FortiGate and a Mac/Windows host):

- Install the appropriate package and complete dependency setup, including cancellation of the OS authorization prompt.
- Import a copy of a real `.conf`; verify host, port, username, realm and all retained extra options. Use test credentials; never commit private profiles.
- Connect and reach an internal IP and an internal DNS name; confirm the app reports connected only after network setup.
- Test `set-dns` and `set-routes` both on and off; compare routes/DNS before connection and after disconnect.
- Check an invalid password and an incorrect certificate fingerprint: neither may establish a tunnel or trigger repeated authentication attempts.
- Test two simultaneous VPNs, then disconnect in both orders. Check shared gateway routes and DNS restoration.
- Test reconnect after a network interruption, cancel during startup, quit from the tray and terminate the UI to exercise the heartbeat cleanup.
- Test native login items and the appropriate macOS architecture. Verify signing/notarization on the actual distribution artifacts.

## Upstream references

- [openfortivpn](https://github.com/adrienverge/openfortivpn) and [Homebrew package](https://formulae.brew.sh/formula/openfortivpn).
- [OpenConnect Windows packages](https://www.infradead.org/openconnect/packages.html#windows), [Fortinet protocol](https://www.infradead.org/openconnect/fortinet.html), and [CLI manual](https://www.infradead.org/openconnect/manual.html).
- [OpenConnect v9.21 source](https://gitlab.com/openconnect/openconnect/-/tree/v9.21), used to verify the Windows console, Wintun and Fortinet login behavior.
