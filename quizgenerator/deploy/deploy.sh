#!/usr/bin/env bash
# Pull the latest code, rebuild the app image and restart the stack.
# Run on the VPS from anywhere:  ~/Mini-Project/quizgenerator/deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing quizgenerator/.env — copy .env.example and fill it in first." >&2
  exit 1
fi
chmod 600 .env

for key in DOMAIN GEMINI_API_KEY ADMIN_PASSWORD TURNSTILE_SECRET VITE_TURNSTILE_SITE_KEY; do
  if ! grep -Eq "^${key}=.+" .env; then
    echo "Set ${key} in .env before deploying." >&2
    exit 1
  fi
done

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building app image (first build takes a few minutes)"
docker compose build app

echo "==> Starting containers"
docker compose up -d --remove-orphans

echo "==> Waiting for the app to become healthy"
for _ in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    domain=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
    echo "OK — https://${domain}  (admin: https://${domain}/admin)"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "App did not become healthy. Recent logs:" >&2
docker compose logs --tail=80 app >&2
exit 1
