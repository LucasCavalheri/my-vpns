#!/usr/bin/env bash
set -euo pipefail

CONF="${1:?caminho do .conf obrigatório}"
NAME="$(basename "$CONF" .conf)"
PIDFILE="/run/my-vpns-${NAME}.pid"

if [[ -f "$PIDFILE" ]]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill -INT "$PID" 2>/dev/null || true
    exit 0
  fi
fi

# Fallback: mata pelo padrão do comando
pkill -INT -f "openfortivpn -c ${CONF}" 2>/dev/null || true
exit 0
