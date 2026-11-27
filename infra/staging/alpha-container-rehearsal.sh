#!/usr/bin/env bash
# CI-only smoke test using the existing runtime and canonical PostgreSQL role.
# No real data, real identity, host ports, provider credentials, or deployment.
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]] || { echo 'Disposable GitHub CI only'; exit 1; }
prefix="alpha-ci-${GITHUB_RUN_ID}"
db="$prefix-db"; api="$prefix-api"; web="$prefix-web"; network="$prefix-net"; volume="$prefix-data"
canary="$prefix-canary"; canary_net="$prefix-control-net"
idp="$prefix-idp"; proxy="$prefix-proxy"; certdir=""
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    docker logs --tail 40 "$api" 2>/dev/null || true
    docker logs --tail 40 "$web" 2>/dev/null || true
    docker logs --tail 20 "$db" 2>/dev/null || true
    docker logs --tail 20 "$idp" 2>/dev/null || true
    docker logs --tail 20 "$proxy" 2>/dev/null || true
  fi
  docker rm -f "$proxy" "$idp" "$web" "$api" "$db" "$canary" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" "$canary_net" >/dev/null 2>&1 || true
  if [[ -n "$certdir" ]]; then rm -rf "$certdir"; fi
  exit "$status"
}
trap cleanup EXIT
docker pull postgres:16
pg_image="$(docker image inspect postgres:16 --format '{{index .RepoDigests 0}}')"
[[ "$pg_image" =~ @sha256:[a-f0-9]{64}$ ]]
docker network create --internal "$network" >/dev/null
[[ "$(docker network inspect "$network" --format '{{.Internal}}')" == true ]]
docker network create --internal "$canary_net" >/dev/null
docker volume create "$volume" >/dev/null
wait_for() {
  local n=0
  until "$@" >/dev/null 2>&1; do
    n=$((n+1)); if (( n >= 60 )); then echo 'Readiness timed out'; return 1; fi
    sleep 1
  done
}
db_start() {
  docker run -d --name "$db" --network "$network" --mount "source=$volume,target=/var/lib/postgresql/data" \
    -e POSTGRES_USER=marketing_test -e POSTGRES_PASSWORD=marketing_test_password -e POSTGRES_DB=marketing_test "$pg_image" >/dev/null
  wait_for docker exec "$db" pg_isready -h 127.0.0.1 -U marketing_test -d marketing_test
}
db_start
docker run --rm --network "container:$db" -e DATABASE_URL='postgresql://marketing_test:marketing_test_password@localhost:5432/marketing_test?schema=public' \
  --entrypoint node medsol-alpha-api:ci /app/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
docker exec -i "$db" psql -X -U marketing_test -d marketing_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE marketing_r3y_runtime LOGIN PASSWORD 'r3y_disposable_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE marketing_test TO marketing_r3y_runtime;
GRANT USAGE ON SCHEMA public TO marketing_r3y_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO marketing_r3y_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marketing_r3y_runtime;
INSERT INTO "Organization" ("id","name","createdAt","updatedAt") VALUES ('alpha-container-fixture','Disposable container persistence marker',now(),now());
SQL
# Canonical signed staging OIDC fixtures: only this disposable, internal network.
# No ports published, no external provider accounts, no actual staging credentials.
seed=(--network "container:$db" -e CI=true -e GITHUB_ACTIONS=true -e MARKETING_DB_INTEGRATION=1
  -e MARKETING_R3Y_STAGING_CI_ONLY=1 -e MARKETING_T1E_STAGING_CI_ONLY=1
  -e DATABASE_URL='postgresql://marketing_test:marketing_test_password@localhost:5432/marketing_test?schema=public')
for fixture in r3y-seed t1e-staging-operator-seed; do
  docker run --rm "${seed[@]}" --entrypoint node medsol-alpha-api:ci "/app/apps/api/e2e/fixtures/$fixture.mjs"
done
certdir="$(mktemp -d)"
chmod 755 "$certdir"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout "$certdir/key.pem" -out "$certdir/cert.pem" >/dev/null 2>&1
chmod 600 "$certdir/key.pem"
chmod 644 "$certdir/cert.pem"
session_key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
oidc=(--network "container:$db" --read-only --cap-drop ALL --security-opt no-new-privileges:true
  -e CI=true -e GITHUB_ACTIONS=true -e MARKETING_DB_INTEGRATION=1
  -e MARKETING_R3Y_STAGING_CI_ONLY=1 -e MARKETING_DISPOSABLE_OIDC_CI_ONLY=1 -e MARKETING_T1E_STAGING_CI_ONLY=1
  -e MARKETING_AUTH_MODE=oidc -e MARKETING_DEPLOYMENT_ENV=staging -e MARKETING_IDENTITY_PROVIDER=STAGING_OIDC
  -e MARKETING_STAGING_OIDC_ENABLED=OFFLINE_OPERATOR_TEST_ONLY -e MARKETING_TENANT_RESOLUTION_MODE=SIGNED_OIDC_CLAIM
  -e MARKETING_OIDC_ISSUER=https://127.0.0.1:3215 -e MARKETING_STAGING_OIDC_TRUSTED_ISSUER=https://127.0.0.1:3215
  -e MARKETING_OIDC_AUDIENCE=api://medsol-r3y -e MARKETING_OIDC_CLIENT_ID=r3y-disposable-browser
  -e MARKETING_STAGING_OIDC_CLIENT_SECRET=r3y-disposable-client-secret-ci-only
  -e MARKETING_OIDC_JWKS_URL=https://127.0.0.1:3215/.well-known/jwks.json
  -e MARKETING_EXTERNAL_EFFECTS_ENABLED=false -e MARKETING_AI_REASONING_ENABLED=false -e MARKETING_REAL_EMAIL_ENABLED=false
  -e MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED=false -e MARKETING_PROVIDER_EGRESS_ENABLED=false
  -e MARKETING_LIVE_DELIVERY_ENABLED=false -e MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED=false
  -e MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED=false -e MARKETING_MODEL_PROVIDER=disabled
  -e MARKETING_PUBLIC_ORIGIN=https://127.0.0.1:3443)
# The CI allowlist checks DSN shape in both web and fixture. Neither needs
# actual database credentials; only the API receives the restricted password.
dummy_dsn='postgresql://marketing_r3y_runtime:unused_fixture_only@localhost:5432/marketing_test?schema=public'
runtime_dsn='postgresql://marketing_r3y_runtime:r3y_disposable_password@localhost:5432/marketing_test?schema=public'
probe='fetch(process.argv[1]).then(r=>process.exit(r.status===Number(process.argv[2])?0:1)).catch(()=>process.exit(1))'
start_apps() {
  # Two helpers have a synthetic certificate/key only; the application
  # containers receive only the public CA and use their normal non-root user.
  docker run -d --name "$idp" "${oidc[@]}" --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$certdir,dst=/tmp/medsol-r3y-jwks,readonly" \
    -e DATABASE_URL='postgresql://marketing_test:unused_fixture_only@localhost:5432/marketing_test?schema=public' \
    --entrypoint node medsol-alpha-api:ci /app/apps/api/e2e/fixtures/r3y-local-oidc.mjs >/dev/null
  wait_for docker exec "$idp" node -e "$probe" http://127.0.0.1:3216/__health 200
  docker run -d --name "$api" "${oidc[@]}" --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --mount "type=bind,src=$certdir/cert.pem,dst=/etc/medsol-ci-ca.pem,readonly" -e NODE_EXTRA_CA_CERTS=/etc/medsol-ci-ca.pem \
    -e DATABASE_URL="$runtime_dsn" -e MARKETING_BRAIN_WORKER_ENABLED=true -e MARKETING_BRAIN_POLL_MS=1000 medsol-alpha-api:ci >/dev/null
  wait_for docker exec "$api" node -e "$probe" http://127.0.0.1:3001/readyz 200
  docker run -d --name "$web" "${oidc[@]}" --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --mount "type=bind,src=$certdir/cert.pem,dst=/etc/medsol-ci-ca.pem,readonly" -e NODE_EXTRA_CA_CERTS=/etc/medsol-ci-ca.pem \
    -e DATABASE_URL="$dummy_dsn" -e MARKETING_SESSION_SECRET="$session_key" -e MARKETING_API_INTERNAL_URL=http://127.0.0.1:3001 medsol-alpha-web:ci >/dev/null
  wait_for docker exec "$web" node -e "$probe" http://127.0.0.1:3000/api/health 200
  docker run -d --name "$proxy" "${oidc[@]}" --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$certdir,dst=/tmp/medsol-r3y-jwks,readonly" \
    -e NODE_EXTRA_CA_CERTS=/tmp/medsol-r3y-jwks/cert.pem -e DATABASE_URL="$dummy_dsn" \
    --entrypoint node medsol-alpha-api:ci /app/apps/api/e2e/fixtures/alpha-packaged-login.mjs proxy >/dev/null
  wait_for docker exec "$proxy" node -e "$probe" https://127.0.0.1:3443/api/health 200
  docker exec "$api" node -e "$probe" http://127.0.0.1:3001/marketing/me 401
  docker exec "$proxy" node /app/apps/api/e2e/fixtures/alpha-packaged-login.mjs verify
  # A persisted active dispatcher heartbeat proves worker startup on the real DB.
  for ((attempt=0; attempt<30; attempt++)); do
    count="$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM \"MarketingWorkerHeartbeat\" WHERE \"workerType\"='BRAIN_DISPATCH' AND \"status\"='ACTIVE' AND \"lastTickStatus\"='EMPTY' AND \"lastSeenAt\">now()-interval '10 seconds';")"
    if [[ "$count" =~ ^[1-9][0-9]*$ ]]; then return 0; fi
    sleep 1
  done
  echo 'No persisted fresh dispatcher heartbeat'; return 1
}
start_apps > alpha-packaged-login-before.txt
docker rm -f "$proxy" "$idp" "$web" "$api" "$db" >/dev/null
db_start
test "$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM \"Organization\" WHERE \"id\"='alpha-container-fixture' AND \"name\"='Disposable container persistence marker';")" = 1
test "$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM pg_roles WHERE rolname='marketing_r3y_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb;")" = 1
test "$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM \"User\" WHERE \"id\" IN ('t1e-stage-admin','t1e-stage-reviewer','t1e-stage-viewer','t1e-stage-foreign');")" = 4
# A restarted process must write a NEW worker heartbeat, not reuse the prior row.
docker exec "$db" psql -X -U marketing_test -d marketing_test -v ON_ERROR_STOP=1 -c "UPDATE \"MarketingWorkerHeartbeat\" SET \"status\"='STOPPED';" >/dev/null
start_apps > alpha-packaged-login-after.txt
printf '%s\n' 'SIGNED_PACKAGED_LOGIN_ROLE_DENIAL_REVOCATION_WORKER_AND_RESTART_PASSED_DISPOSABLE_ONLY' > alpha-packaged-identity-status.txt
# Positive control on a separate isolated network; no external internet or
# live provider is contacted. The tested app namespace must not reach it.
docker run -d --name "$canary" --network "$canary_net" --read-only --cap-drop ALL \
  --entrypoint node medsol-alpha-api:ci -e "require('node:http').createServer((q,s)=>s.end('control')).listen(38080,'0.0.0.0')" >/dev/null
wait_for docker exec "$canary" node -e "$probe" http://127.0.0.1:38080/ 200
canary_ip="$(docker inspect "$canary" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
[[ "$canary_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
docker run --rm --network "$canary_net" --read-only --cap-drop ALL --entrypoint node medsol-alpha-api:ci -e "$probe" "http://$canary_ip:38080/" 200
deny='const net=require("node:net");const socket=net.createConnection({host:process.argv[1],port:38080});socket.setTimeout(2000);socket.once("connect",()=>{socket.destroy();process.exit(1)});socket.once("error",()=>process.exit(0));socket.once("timeout",()=>{socket.destroy();process.exit(0)});'
for service in "$api" "$web"; do
  docker exec "$service" node -e "$deny" "$canary_ip"
done
printf '%s\n' 'CI_ISOLATED_NETWORK_CONTROL_CANARY_DENIED_NOT_HOST_FIREWALL_PROOF' > alpha-isolation-evidence.txt
printf '%s\n' 'DISPOSABLE_CONTAINER_STARTUP_AND_VOLUME_REPLACEMENT_PASSED_NOT_DEPLOYED' > alpha-container-rehearsal-status.txt
printf '%s\n' "$pg_image" > alpha-postgres-image.txt
