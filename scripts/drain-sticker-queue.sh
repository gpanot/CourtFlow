#!/usr/bin/env bash
# Drives the production sticker-generation queue one job at a time until drained.
# Each POST to the processor runs exactly one job (concurrency = 1) and returns
# when that job finishes. We loop until the queue reports "idle".
set -uo pipefail

DOMAIN="https://courtflow-production-0441.up.railway.app"
EP="$DOMAIN/api/internal/process-sticker-queue"
MAX_ITERS=120

status_of() {
  python3 -c "import sys,json;
try:
    print(json.load(sys.stdin).get('status','parse_err'))
except Exception:
    print('parse_err')" 2>/dev/null
}

echo "=== drain start $(date '+%H:%M:%S') ==="
for i in $(seq 1 "$MAX_ITERS"); do
  RESP=$(curl -s -m 320 -X POST "$EP")
  ST=$(printf '%s' "$RESP" | status_of)
  echo "[iter $i $(date '+%H:%M:%S')] status=$ST resp=$RESP"

  case "$ST" in
    idle)
      echo "=== queue drained — done $(date '+%H:%M:%S') ==="
      break
      ;;
    done|skipped)
      sleep 3
      ;;
    busy)
      # Previous job still running (request likely timed out our side); wait longer
      sleep 30
      ;;
    *)
      # error / parse_err / empty — back off then retry
      sleep 15
      ;;
  esac
done
echo "=== drain loop exited $(date '+%H:%M:%S') ==="
