#!/bin/bash
# deploy.sh — Deploy for Body&Sleeves on a 1 vCPU / 2 GB Droplet.
#
# Build strategy: build ON the server, but stop PM2 first to free RAM.
# A 1 vCPU / 2 GB machine cannot safely run npm run build AND serve traffic
# simultaneously — the build peaks at 600-900 MB and will cause OOM.
#
# Stopping PM2 first frees ~165 MB and gives the build process the full
# 2 GB to work with. Downtime window is ~30-60 seconds (build time).
# This is acceptable for a low-traffic POD storefront.
#
# For zero-downtime deploys, use build-and-push.sh from your local machine.

set -euo pipefail

APP_DIR="/var/www/bodyandsleeves"
PM2_NAME="bodyandsleeves"
SKIP_BUILD="${1:-}"

echo "🚀 Deploying $PM2_NAME..."

cd "$APP_DIR"

if [[ "$SKIP_BUILD" != "--skip-build" ]]; then
  # ── Pull latest code ──────────────────────────────────────────────────────
  echo "📦 Pulling latest code..."
  git stash
  GIT_SSH_COMMAND='ssh -i /root/.ssh/github_deploy' git pull

  # ── Stop PM2 BEFORE building to free RAM ─────────────────────────────────
  # Build peaks at 600-900 MB. Running app uses 165 MB.
  # Combined on a 2 GB Droplet = OOM during build.
  # Stopping first gives the build the full machine.
  echo "⏸️  Stopping app to free RAM for build (~30-60s downtime)..."
  pm2 stop "$PM2_NAME" 2>/dev/null || true

  # ── Install + Build ───────────────────────────────────────────────────────
  echo "🔧 Installing dependencies..."
  npm install --prefer-offline

  echo "🏗️  Building... (app stopped, full RAM available)"
  npm run build
fi

# ── Copy assets to standalone ─────────────────────────────────────────────
echo "📋 Copying assets to standalone..."
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env.local .next/standalone/.env.local

# ── Regenerate ecosystem.config.js ───────────────────────────────────────
node - << 'JSEOF'
const fs = require('fs');
const raw = fs.readFileSync('/var/www/bodyandsleeves/.env.local', 'utf8');
const env = {};
raw.split('\n').forEach(l => {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) env[m[1].trim()] = m[2].trim();
});
env.APP_ROOT = '/var/www/bodyandsleeves';
env.PM2_APP_NAME = 'bodyandsleeves';
env.PORT = '3000';
const app = {
  name: 'bodyandsleeves',
  script: 'server.js',
  interpreter: 'node',
  cwd: '/var/www/bodyandsleeves/.next/standalone',
  max_memory_restart: '400M',
  node_args: '--max-old-space-size=512',
  env,
};
const config = 'module.exports = { apps: [' + JSON.stringify(app) + '] };';
fs.writeFileSync('/var/www/bodyandsleeves/ecosystem.config.js', config);
console.log('ecosystem.config.js written (max_memory_restart=400M, max-old-space-size=512)');
JSEOF

# ── Start app ─────────────────────────────────────────────────────────────
echo "▶️  Starting app..."
if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
  pm2 start ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

# ── Deploy edge functions ─────────────────────────────────────────────────
source_env() {
  grep "^${1}=" "$APP_DIR/.env.local" | cut -d'=' -f2- | tr -d '\r'
}

SUPABASE_ACCESS_TOKEN=$(source_env SUPABASE_ACCESS_TOKEN)
SUPABASE_PROJECT_REF=$(source_env SUPABASE_PROJECT_REF)

if [ -n "$SUPABASE_ACCESS_TOKEN" ] && [ -n "$SUPABASE_PROJECT_REF" ]; then
  echo "🔁 Deploying edge functions..."
  export SUPABASE_ACCESS_TOKEN
  supabase functions deploy printify-proxy printify-webhook stripe-checkout stripe-webhook \
    --project-ref "$SUPABASE_PROJECT_REF" 2>/dev/null || echo "⚠️  Edge function deploy failed — skipping."

  # ── Push Stripe secrets from DB to edge function ──────────────────────────
  # Reads the active Stripe keys from the settings table and pushes them to
  # Supabase secrets so the edge function always has the correct key after deploy.
  echo "🔑 Syncing Stripe secrets from DB to edge function..."
  SUPABASE_URL=$(source_env NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY=$(source_env SUPABASE_SERVICE_ROLE_KEY)

  node - << JSEOF
const https = require('https');
const url = new URL('${SUPABASE_URL}/rest/v1/settings?select=stripe_mode,stripe_live_secret_key,stripe_live_webhook_secret,stripe_test_secret_key,stripe_test_webhook_secret&limit=1');
const options = {
  hostname: url.hostname,
  path: url.pathname + url.search,
  headers: {
    'apikey': '${SUPABASE_SERVICE_ROLE_KEY}',
    'Authorization': 'Bearer ${SUPABASE_SERVICE_ROLE_KEY}',
    'Accept': 'application/json',
  },
};
https.get(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const rows = JSON.parse(data);
      const row = rows[0];
      if (!row) { console.error('No settings row found'); process.exit(1); }
      const mode = row.stripe_mode === 'live' ? 'live' : 'test';
      const secretKey = mode === 'live' ? row.stripe_live_secret_key : row.stripe_test_secret_key;
      const webhookSecret = mode === 'live' ? row.stripe_live_webhook_secret : row.stripe_test_webhook_secret;
      if (!secretKey) { console.error('No Stripe key in DB for mode:', mode); process.exit(1); }
      const payload = JSON.stringify([
        { name: 'STRIPE_SECRET_KEY', value: secretKey },
        { name: 'STRIPE_WEBHOOK_SECRET', value: webhookSecret || '' },
      ]);
      const pushUrl = new URL('https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/secrets');
      const req = https.request({ hostname: pushUrl.hostname, path: pushUrl.pathname, method: 'POST', headers: { 'Authorization': 'Bearer ${SUPABASE_ACCESS_TOKEN}', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (r) => {
        let body = ''; r.on('data', c => body += c);
        r.on('end', () => {
          if (r.statusCode >= 200 && r.statusCode < 300) console.log('✅ Stripe secrets synced (mode:', mode + ')');
          else console.error('⚠️  Failed to push secrets:', r.statusCode, body);
        });
      });
      req.on('error', e => console.error('⚠️  Secret push error:', e.message));
      req.write(payload); req.end();
    } catch(e) { console.error('⚠️  Failed to parse settings:', e.message); }
  });
}).on('error', e => console.error('⚠️  Failed to fetch settings:', e.message));
JSEOF
else
  echo "⚠️  Skipping edge functions (SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF not set)."
fi

# ── Reload Nginx ──────────────────────────────────────────────────────────
nginx -s reload

echo ""
echo "✅ Deploy complete! Build ID: $(cat .next/BUILD_ID)"
