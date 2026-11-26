#!/usr/bin/env bash
# CI-only security evidence; not independent pentest or deployed acceptance.
# Reviewed official Trivy 0.76.2 index digest:
# https://github.com/aquasecurity/trivy/pkgs/container/trivy
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Disposable CI only'; exit 1; }
scanner='ghcr.io/aquasecurity/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb'
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/cache" "$work/images" "$work/reports"
docker pull "$scanner"
printf '%s\n' "$scanner" > alpha-scanner-image.txt
# Scanner receives exported image archives, never the Docker socket, repository,
# environment secrets or credentials. DB download is isolated to this CI step.
for target in api web; do
  docker save "medsol-alpha-$target:ci" -o "$work/images/$target.tar"
done
docker run --rm --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,src=$work/cache,dst=/cache" "$scanner" \
  image --cache-dir /cache --download-db-only --timeout 5m
test -s "$work/cache/db/metadata.json"
cp "$work/cache/db/metadata.json" alpha-image-scan-db.json
for target in api web; do
  docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=bind,src=$work/cache,dst=/cache" \
    --mount "type=bind,src=$work/images,dst=/images,readonly" \
    --mount "type=bind,src=$work/reports,dst=/reports" "$scanner" \
    image --cache-dir /cache --skip-db-update --skip-java-db-update --offline-scan \
    --scanners vuln --pkg-types os,library --list-all-pkgs --format json \
    --output "/reports/$target.json" --timeout 5m --input "/images/$target.tar"
  cp "$work/reports/$target.json" "alpha-$target-vulnerabilities.json"
done
node scripts/quality/alpha-image-vulnerability-gate.mjs
