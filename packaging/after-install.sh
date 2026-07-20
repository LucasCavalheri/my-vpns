#!/bin/bash
set -e

install -d /usr/lib/my-vpns

APP_DIR=""
for candidate in "/opt/My VPNs" "/opt/my-vpns"; do
  if [ -x "$candidate/my-vpns" ]; then
    APP_DIR="$candidate"
    break
  fi
done

if [ -n "$APP_DIR" ]; then
  RES_DIR="$APP_DIR/resources"

  if [ -f "$RES_DIR/helpers/run-vpn.sh" ]; then
    install -m 0755 "$RES_DIR/helpers/run-vpn.sh" /usr/lib/my-vpns/run-vpn.sh
    install -m 0755 "$RES_DIR/helpers/stop-vpn.sh" /usr/lib/my-vpns/stop-vpn.sh
  fi

  if [ -f "$RES_DIR/polkit/dev.cavallheri.myvpns.policy" ]; then
    install -d /usr/share/polkit-1/actions
    install -m 0644 "$RES_DIR/polkit/dev.cavallheri.myvpns.policy" \
      /usr/share/polkit-1/actions/dev.cavallheri.myvpns.policy
  fi

  # Electron SUID sandbox — required or the app exits immediately on launch
  SANDBOX="$APP_DIR/chrome-sandbox"
  if [ -f "$SANDBOX" ]; then
    chown root:root "$SANDBOX"
    chmod 4755 "$SANDBOX"
  fi

  # Ubuntu 24+ userns / AppArmor profile shipped by electron-builder
  if [ -f "$RES_DIR/apparmor-profile" ] && command -v apparmor_parser >/dev/null 2>&1; then
    install -m 0644 "$RES_DIR/apparmor-profile" /etc/apparmor.d/my-vpns || true
    apparmor_parser -r /etc/apparmor.d/my-vpns 2>/dev/null || true
  fi

  # Stable launcher (spaces in /opt path + --no-sandbox fallback for modern kernels)
  cat > /usr/bin/my-vpns << EOF
#!/bin/bash
exec "$APP_DIR/my-vpns" --no-sandbox "\$@"
EOF
  chmod 755 /usr/bin/my-vpns

  for DESKTOP in \
    /usr/share/applications/my-vpns.desktop \
    /usr/share/applications/My\ VPNs.desktop; do
    if [ -f "$DESKTOP" ]; then
      sed -i 's|^Exec=.*|Exec=/usr/bin/my-vpns %U|' "$DESKTOP"
      if ! grep -q '^StartupWMClass=' "$DESKTOP"; then
        printf '\nStartupWMClass=my-vpns\n' >> "$DESKTOP"
      fi
    fi
  done
fi

# APT repo so `sudo apt upgrade` can pull newer builds from GitHub Pages
if [ -d /etc/apt/sources.list.d ]; then
  cat > /etc/apt/sources.list.d/my-vpns.list << 'EOF'
deb [trusted=yes arch=amd64] https://lucascavalheri.github.io/my-vpns/apt ./
EOF
fi

exit 0
