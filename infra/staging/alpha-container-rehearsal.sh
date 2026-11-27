#!/usr/bin/env bash
# CI-only smoke test using the existing runtime and canonical PostgreSQL role.
# No real data, real identity, host ports, provider credentials, or deployment.
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]] || { echo 'Disposable GitHub CI only'; exit 1; }
prefix="alpha-ci-${GITHUB_RUN_ID}"
db="$prefix-db"; api="$prefix-api"; web="$prefix-web"; network="$prefix-net"; volume="$prefix-data"
canary="$prefix-canary"; canary_net="$prefix-control-net"
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    docker logs --tail 40 "$api" 2>/dev/null || true
    docker logs --tail 40 "$web" 2>/dev/null || true
    docker logs --tail 20 "$db" 2>/dev/null || true
  fi
  docker rm -f "$web" "$api" "$db" "$canary" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" "$canary_net" >/dev/null 2>&1 || true
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
# Synthetic OIDC configuration only, deliberately no issuer is exposed.
# Actual signed operator login is tested by the existing separate CI suite.
common=(--network "container:$db" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges:true
  -e CI=true -e GITHUB_ACTIONS=true -e MARKETING_R3Y_STAGING_CI_ONLY=1 -e MARKETING_DISPOSABLE_OIDC_CI_ONLY=1
  -e MARKETING_BOOTSTRAP_ORGANIZATION_ID=alpha-container-fixture -e MARKETING_AUTH_MODE=oidc
  -e MARKETING_ENTRA_TENANT_ID=11111111-1111-4111-8111-111111111111 -e MARKETING_ENTRA_API_SCOPE=api://medsol-r3y/marketing
  -e MARKETING_OIDC_ISSUER=https://127.0.0.1:3215 -e MARKETING_OIDC_AUDIENCE=api://medsol-r3y
  -e MARKETING_OIDC_JWKS_URL=https://127.0.0.1:3215/.well-known/jwks.json
  -e MARKETING_EXTERNAL_EFFECTS_ENABLED=false -e MARKETING_AI_REASONING_ENABLED=false -e MARKETING_REAL_EMAIL_ENABLED=false
  -e MARKETING_BRAIN_WORKER_ENABLED=false)
probe='fetch(process.argv[1]).then(r=>process.exit(r.status===Number(process.argv[2])?0:1)).catch(()=>process.exit(1))'
start_apps() {
  docker run -d --name "$api" "${common[@]}" -e DATABASE_URL='postgresql://marketing_r3y_runtime:r3y_disposable_password@localhost:5432/marketing_test?schema=public' medsol-alpha-api:ci >/dev/null
  wait_for docker exec "$api" node -e "$probe" http://127.0.0.1:3001/readyz 200
  docker run -d --name "$web" "${common[@]}" -e MARKETING_API_INTERNAL_URL=http://127.0.0.1:3001 -e MARKETING_PUBLIC_ORIGIN=https://127.0.0.1:3443 -e MARKETING_OIDC_CLIENT_ID=r3y-disposable-browser medsol-alpha-web:ci >/dev/null
  wait_for docker exec "$web" node -e "$probe" http://127.0.0.1:3000/api/health 200
  docker exec "$web" node -e "$probe" http://127.0.0.1:3000/api/marketing/me 401
  docker exec "$api" node -e "$probe" http://127.0.0.1:3001/marketing/me 401
}
start_apps
docker rm -f "$web" "$api" "$db" >/dev/null
db_start
test "$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM \"Organization\" WHERE \"id\"='alpha-container-fixture' AND \"name\"='Disposable container persistence marker';")" = 1
test "$(docker exec "$db" psql -X -U marketing_test -d marketing_test -Atc "SELECT count(*) FROM pg_roles WHERE rolname='marketing_r3y_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb;")" = 1
start_apps
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
