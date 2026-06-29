#!/usr/bin/env bash
# Run ON THE VM, from inside the copied scraper-service directory:
#   cd ~/scraper-service && bash deploy/bootstrap.sh
# Installs build deps + Rust, builds the release binary, and installs the
# systemd service + timer that drains the scrape_requests queue.
set -euo pipefail

echo "==> apt deps"
sudo apt-get update -y
sudo apt-get install -y build-essential pkg-config libssl-dev git curl ca-certificates

# A little swap prevents OOM during the Rust build on small instances.
if [ ! -f /swapfile ]; then
  echo "==> 2G swap (build headroom)"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "==> installing Rust"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1090
source "$HOME/.cargo/env"

echo "==> building release binary (a few minutes)"
cargo build --release

echo "==> installing binary -> /usr/local/bin/asterion-catalog-runner"
sudo install -Dm755 target/release/catalog-runner /usr/local/bin/asterion-catalog-runner

echo "==> env file + systemd units"
sudo mkdir -p /etc/asterion
if [ ! -f /etc/asterion/asterion.env ]; then
  sudo cp deploy/asterion.env.example /etc/asterion/asterion.env
  sudo chmod 600 /etc/asterion/asterion.env
fi
sudo cp deploy/asterion-scraper.service /etc/systemd/system/
sudo cp deploy/asterion-scraper.timer   /etc/systemd/system/
sudo systemctl daemon-reload

cat <<'EOF'

✓ Built & installed.

  1. Set your secret key:   sudo nano /etc/asterion/asterion.env   (SUPABASE_SERVICE_KEY=sb_secret_...)
  2. Start the queue timer: sudo systemctl enable --now asterion-scraper.timer
  3. Watch it:              journalctl -u asterion-scraper.service -f

GCS auth uses the VM's attached service account automatically — no token to set.
EOF
