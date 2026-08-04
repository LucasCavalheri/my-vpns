# My VPNs APT repository

The repository metadata is signed with the My VPNs archive key.
Fingerprint: `A9F137BEE74B623131071358FB0EC1D5A01262F0`

```bash
curl -fsSL https://lucascavalheri.github.io/my-vpns/apt/my-vpns-archive-keyring.asc \
  | sudo tee /usr/share/keyrings/my-vpns-archive-keyring.asc >/dev/null
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/my-vpns-archive-keyring.asc] https://lucascavalheri.github.io/my-vpns/apt ./' \
  | sudo tee /etc/apt/sources.list.d/my-vpns.list
sudo apt update
sudo apt install my-vpns
```

After installation, upgrades come with `sudo apt upgrade`.
