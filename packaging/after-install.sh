#!/bin/bash
set -e

install -d /usr/lib/my-vpns

# electron-builder instala em /opt/<productName>
for APP_DIR in "/opt/My VPNs" "/opt/my-vpns"; do
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
done

exit 0
