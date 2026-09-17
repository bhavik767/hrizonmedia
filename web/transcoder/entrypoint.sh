#!/usr/bin/env bash
set -euo pipefail

node /app/transcoder/worker.mjs &
application_pid=$!

cleanup() {
  kill -TERM "$application_pid" "${queue_worker_pid:-}" 2>/dev/null || true
  wait "$application_pid" 2>/dev/null || true
  if [[ -n "${queue_worker_pid:-}" ]]; then wait "$queue_worker_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:"$PORT"/health >/dev/null; then break; fi
  sleep 1
done

if ! curl --fail --silent --show-error http://127.0.0.1:"$PORT"/health >/dev/null; then
  echo 'Transcoder HTTP server did not become ready.' >&2
  exit 1
fi

/usr/local/bin/salad-http-job-queue-worker &
queue_worker_pid=$!

wait -n "$application_pid" "$queue_worker_pid"
