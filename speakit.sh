#!/usr/bin/env bash
#
# Speakit — start the backend and test the frontend with one script.
#
#   ./speakit.sh start [port]   # install deps, sync DB, run backend+frontend dev server (default)
#   ./speakit.sh test [port]    # typecheck + backend smoke tests + live frontend checks
#   ./speakit.sh prod [port]    # production build + production server (backend+frontend)
#   ./speakit.sh doctor         # self-check: versions, port, last crash log
#
# Backend (REST API + Socket.io) and frontend (Next.js) run together from
# server.ts on one port. No port given? A random free one is picked automatically,
# so you never collide with some other app squatting on 3000.
# Force a port with:  ./speakit.sh start 5000   or   PORT=5000 ./speakit.sh start
set -euo pipefail

PORT="${2:-${PORT:-}}"
export PORT  # the server (child process) reads its port from this — without export it falls back to 3000
APP_URL=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 1; }; }
need node; need npm; need curl

setup() {
  echo "==> installing dependencies"
  npm install --no-audit --no-fund
  echo "==> clearing stale build caches (prevents old/new framework code mixing)"
  rm -rf .next .server
  echo "==> syncing database"
  npx prisma db push
}

wait_for_ready() {
  echo "==> waiting for Speakit on ${APP_URL}"
  for i in $(seq 1 60); do
    if curl -sf -m 3 "${APP_URL}/login" >/dev/null 2>&1; then
      echo "    up after ~$((i * 2))s"
      return 0
    fi
    sleep 2
  done
  echo "server did not become ready in time" >&2
  echo "---- last 30 lines of /tmp/speakit-dev.log ----" >&2
  tail -n 30 /tmp/speakit-dev.log >&2 || true
  return 1
}

# True if Speakit itself already answers on $APP_URL (-f: a stranger's 404 doesn't count).
port_in_use() { curl -sf -m 3 -o /dev/null "${APP_URL}/login" >/dev/null 2>&1; }

# True if ANYTHING answers on the given port (even a stranger's website).
port_busy() { curl -s -m 2 -o /dev/null "http://localhost:$1/" >/dev/null 2>&1; }

# Pick a random free port in 40000-59999.
pick_random_port() {
  for _ in $(seq 1 50); do
    CANDIDATE=$((RANDOM % 20000 + 40000))
    if ! port_busy "$CANDIDATE"; then echo "$CANDIDATE"; return 0; fi
  done
  return 1
}

# Settle the final PORT/APP_URL. Random free port unless the user chose one.
# If the chosen port is squatted by some other app, hop to a free one.
settle_port() {
  if [ -z "$PORT" ]; then
    PORT="$(pick_random_port)" || { echo "could not find a free port" >&2; exit 1; }
  fi
  APP_URL="http://localhost:${PORT}"
  if ! port_in_use && port_busy "$PORT"; then
    echo "port ${PORT} is taken by another app — picking a free one instead"
    PORT="$(pick_random_port)" || { echo "could not find a free port" >&2; exit 1; }
    APP_URL="http://localhost:${PORT}"
  fi
}

doctor() {
  echo "== Speakit doctor =="
  echo "node: $(node --version 2>&1)   npm: $(npm --version 2>&1)"
  echo "NODE_OPTIONS: [${NODE_OPTIONS:-<unset>}]"
  node -e "const m=process.version.match(/v(\\d+)/); if(+m[1]<18){console.error('!! node 18+ required, you have '+process.version);process.exit(1)} else {console.log('node version OK (>=18)')}"
  [ -d node_modules ] && echo "dependencies: installed" || echo "dependencies: MISSING (run ./speakit.sh start once)"
  [ -f .env ] && echo ".env: present" || echo ".env: MISSING"
  [ -f prisma/dev.db ] && echo "database: present (prisma/dev.db)" || echo "database: not created yet (normal before first start)"
  if port_in_use; then echo "port ${PORT}: something is already running there"; else echo "port ${PORT}: free"; fi
  if [ -f /tmp/speakit-dev.log ]; then echo "---- last 20 lines of /tmp/speakit-dev.log ----"; tail -n 20 /tmp/speakit-dev.log; fi
}

check_frontend() {
  echo "==> testing frontend"
  local code body
  code="$(curl -s -m 10 -o /tmp/speakit-login.html -w "%{http_code}" "${APP_URL}/login")"
  [ "$code" = "200" ] || { echo "FAIL: /login -> HTTP $code" >&2; return 1; }
  grep -q "Speakit" /tmp/speakit-login.html || { echo "FAIL: /login has no Speakit branding" >&2; return 1; }
  echo "    OK  GET /login -> 200, Speakit page renders"

  code="$(curl -s -m 10 -o /tmp/speakit-register.html -w "%{http_code}" "${APP_URL}/register")"
  [ "$code" = "200" ] || { echo "FAIL: /register -> HTTP $code" >&2; return 1; }
  echo "    OK  GET /register -> 200"
}

check_backend() {
  echo "==> testing backend API"
  local code
  code="$(curl -s -m 10 -o /tmp/speakit-me.json -w "%{http_code}" "${APP_URL}/api/auth/me")"
  [ "$code" = "200" ] || { echo "FAIL: /api/auth/me -> HTTP $code" >&2; return 1; }
  grep -q "user" /tmp/speakit-me.json || { echo "FAIL: /api/auth/me bad body" >&2; return 1; }
  echo "    OK  GET /api/auth/me -> 200 (auth layer responds)"

  # Socket.io handshake endpoint must answer (real-time layer alive)
  code="$(curl -s -m 10 -o /dev/null -w "%{http_code}" "${APP_URL}/socket.io/?EIO=4&transport=polling")"
  [ "$code" = "200" ] || { echo "FAIL: /socket.io handshake -> HTTP $code" >&2; return 1; }
  echo "    OK  Socket.io handshake -> 200 (real-time layer alive)"
}

check_unit() {
  echo "==> typecheck + data-layer smoke tests"
  npx tsc --noEmit
  echo "    OK  tsc --noEmit (zero errors)"
  npx tsx scripts/smoke.ts
}

cmd="${1:-start}"
case "$cmd" in
  start)
    settle_port
    if port_in_use; then
      echo "Speakit (or something) is already running on ${APP_URL}"
      echo "Just open ${APP_URL} in your browser. To restart it, stop the other window first (Ctrl+C)."
      exit 0
    fi
    setup
    echo "==> starting Speakit (backend + frontend) on ${APP_URL}"
    echo "    FIRST LAUNCH TAKES A MINUTE (install + first compile)."
    echo "    Wait for the line  ✅ Speakit ready on http://0.0.0.0:${PORT}"
    echo "    and ONLY then open  ${APP_URL}  in your browser -> Register."
    echo "    Keep this window open. Stop the app any time with Ctrl+C."
    DEV_CODE=0
    npm run dev || DEV_CODE=$?
    echo "Speakit stopped (exit code ${DEV_CODE}). Normal Ctrl+C shows 130 — anything else means it crashed; paste this log."
    ;;
  test)
    settle_port
    setup
    # Start the server in the background if nothing is listening yet.
    STARTED_BY_SCRIPT=0
    SERVER_PID=""
    if ! curl -sf -m 3 "${APP_URL}/login" >/dev/null 2>&1; then
      echo "==> no server running, starting one in the background"
      npm run dev >/tmp/speakit-dev.log 2>&1 &
      SERVER_PID="$!"
      STARTED_BY_SCRIPT=1
      trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
      wait_for_ready
    else
      echo "==> reusing already-running server on ${APP_URL}"
    fi
    check_frontend
    check_backend
    check_unit
    if [ "$STARTED_BY_SCRIPT" = "1" ]; then
      kill "$SERVER_PID" 2>/dev/null || true
      trap - EXIT
    fi
    echo
    echo "All Speakit checks passed ✅  (frontend renders, backend + Socket.io respond, 26 smoke tests green)"
    ;;
  prod)
    settle_port
    setup
    npm run build
    echo "==> starting production server on ${APP_URL}"
    npm start
    ;;
  doctor)
    settle_port
    doctor
    ;;
  *)
    echo "usage: ./speakit.sh [start|test|prod|doctor] [port]" >&2
    exit 1
    ;;
esac
