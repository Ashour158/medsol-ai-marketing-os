#!/usr/bin/env bash
# Development preview only. Never provisions credentials or changes auth policy.
set -euo pipefail
[[ "${CODESPACES:-}" == true && -n "${CODESPACE_NAME:-}" ]] || { echo 'Codespaces only'; exit 1; }
cd "$(git rev-parse --show-toplevel)"
state="$HOME/.local/state/medsol-private-preview/$CODESPACE_NAME"
mkdir -p "$state"
chmod 700 "$state"
exec 9>"$state/start.lock"
flock -n 9 || exit 0
if curl --silent --fail --max-time 3 http://127.0.0.1:3000/ >/dev/null 2>&1; then
  echo 'Port 3000 already responds; no second process started. Verify it is the intended private preview.'
  exit 0
fi
if [[ -f "$state/pid" ]]; then
  pid="$(cat "$state/pid")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    echo 'Previous preview process is still running. Inspect its private log.'
    exit 0
  fi
fi
test -s pnpm-lock.yaml
# These are only flags, not credentials. No CI bypass or bootstrap session.
export MARKETING_EXTERNAL_EFFECTS_ENABLED=false MARKETING_AI_REASONING_ENABLED=false
export MARKETING_REAL_EMAIL_ENABLED=false MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED=false
export MARKETING_PROVIDER_EGRESS_ENABLED=false MARKETING_LIVE_DELIVERY_ENABLED=false
export MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED=false MARKETING_MODEL_PROVIDER=disabled
export MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED=false NEXT_TELEMETRY_DISABLED=1
# The dev shell deliberately does not configure an OIDC issuer, API or database.
# Anonymous protected API requests continue to fail closed.
unset MARKETING_BOOTSTRAP_TOKEN MARKETING_BOOTSTRAP_ORGANIZATION_ID
nohup pnpm --filter @medsol/web dev --hostname 127.0.0.1 --port 3000 >"$state/preview.log" 2>&1 </dev/null 9>&- &
echo "$!" >"$state/pid"
echo 'Started private development preview on port 3000. Not an authenticated full-stack deployment.'
echo "Preview log: $state/preview.log"
