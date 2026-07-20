#!/bin/bash
# Build / refresh a flat APT repo suitable for GitHub Pages.
# Usage: build-apt-repo.sh <repo-root> <deb-file> [more.deb...]
set -euo pipefail

REPO_ROOT="${1:?repo root required}"
shift
if [ "$#" -lt 1 ]; then
  echo "usage: $0 <repo-root> <deb> [deb...]" >&2
  exit 1
fi

mkdir -p "$REPO_ROOT"
for deb in "$@"; do
  cp -f "$deb" "$REPO_ROOT/"
done

# Keep only .deb packages in the flat root for Packages index
(
  cd "$REPO_ROOT"
  dpkg-scanpackages --multiversion . /dev/null > Packages
  gzip -9c Packages > Packages.gz
)

# Tiny index for humans
cat > "$REPO_ROOT/README.md" << 'EOF'
# My VPNs APT repository

```bash
echo 'deb [trusted=yes arch=amd64] https://lucascavalheri.github.io/my-vpns/apt ./' \
  | sudo tee /etc/apt/sources.list.d/my-vpns.list
sudo apt update
sudo apt install my-vpns
```

Upgrades via `sudo apt upgrade` after that.
EOF

echo "APT repo ready at $REPO_ROOT"
ls -lh "$REPO_ROOT"
