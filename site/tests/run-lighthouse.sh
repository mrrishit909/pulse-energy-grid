#!/bin/bash
# P04-QA-001 / P04-QA-002: real Lighthouse runs against the served production build (adapted from shared/testing/run-lighthouse.sh).
# Usage: tests/run-lighthouse.sh [url] [out-dir] [runs]. Mobile and desktop presets, N runs each, uptime recorded per run.
# Never fabricate these numbers; a run at load average > 8 is load-confounded (ENGINEERING_DECISIONS #58).
set -uo pipefail
URL="${1:-http://localhost:4331/pulse-energy-grid/}"; OUT="${2:-../artifacts/evidence/qa/lighthouse}"; RUNS="${3:-3}"
mkdir -p "$OUT"; SUM="$OUT/summary.jsonl"; : > "$SUM"
for i in $(seq 1 "$RUNS"); do
  for f in mobile desktop; do
    LOAD=$(uptime)
    PRESET=$([ "$f" = desktop ] && echo "--preset=desktop" || echo "")
    npx --yes lighthouse@13 "$URL" --quiet --chrome-flags="--headless=new" $PRESET --output=json --output-path="$OUT/$f-$i.report.json" >/dev/null 2>&1
    node -e "const r=require('$(cd "$OUT" && pwd)/$f-$i.report.json');const c=r.categories,a=r.audits;console.log(JSON.stringify({run:$i,preset:'$f',perf:c.performance.score,a11y:c.accessibility.score,bp:c['best-practices'].score,seo:c.seo.score,lcp_ms:Math.round(a['largest-contentful-paint'].numericValue),fcp_ms:Math.round(a['first-contentful-paint'].numericValue),cls:a['cumulative-layout-shift'].numericValue,tbt_ms:Math.round(a['total-blocking-time'].numericValue),uptime:process.argv[1]}))" "$LOAD" | tee -a "$SUM"
  done
done
