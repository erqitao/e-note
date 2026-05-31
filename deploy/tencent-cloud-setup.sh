#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/e-note"
DATA_DIR="/var/www/e-note-data"
REPO_URL="${REPO_URL:-https://github.com/erqitao/e-note.git}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 18+ first."
  exit 1
fi

sudo mkdir -p "$APP_DIR" "$DATA_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR" "$DATA_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi

cd "$APP_DIR"
npm install --omit=dev

sudo npm install -g pm2
pm2 startOrReload ecosystem.config.cjs
pm2 save

sudo cp deploy/nginx-e-note.conf /etc/nginx/sites-available/e-note
sudo ln -sf /etc/nginx/sites-available/e-note /etc/nginx/sites-enabled/e-note
sudo nginx -t
sudo systemctl reload nginx

echo "E-Note is running behind Nginx. Open your server public IP in the browser."
