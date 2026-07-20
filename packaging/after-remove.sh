#!/bin/bash
set -e

rm -f /usr/lib/my-vpns/run-vpn.sh
rm -f /usr/lib/my-vpns/stop-vpn.sh
rmdir /usr/lib/my-vpns 2>/dev/null || true
rm -f /usr/share/polkit-1/actions/dev.cavallheri.myvpns.policy

exit 0
