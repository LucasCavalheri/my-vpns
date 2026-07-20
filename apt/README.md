# My VPNs APT repository

```bash
echo 'deb [trusted=yes arch=amd64] https://lucascavalheri.github.io/my-vpns/apt ./' \
  | sudo tee /etc/apt/sources.list.d/my-vpns.list
sudo apt update
sudo apt install my-vpns
```

Upgrades via `sudo apt upgrade` after that.
