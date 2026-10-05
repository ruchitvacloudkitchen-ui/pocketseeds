#!/bin/sh
# Runs every audit in this directory. Each one starts and stops its own server,
# so this needs nothing running beforehand.
#
#   sh tools/audit-all.sh
#   CHROME_PATH=/path/to/chrome sh tools/audit-all.sh
#
# A crash is a failure. `grep FAIL || echo clean` prints "clean" when a run
# dies before printing any FAIL line at all, which is how two broken runs were
# once reported as passing -- so this requires the summary line to be present
# and the exit status to be zero.
set -u
dir=$(dirname "$0")
status=0
for f in app-audit.js pages-audit.js offline-audit.js; do
  out=$(mktemp)
  printf '%s: ' "$f"
  if node "$dir/$f" > "$out" 2>&1; then rc=0; else rc=$?; fi
  if grep -q "passed," "$out"; then
    grep "passed," "$out" | tr -d '\n'; echo
    grep "  FAIL  " "$out" || true
  else
    echo "NO SUMMARY LINE — the run did not finish (exit $rc). Last lines:"
    tail -8 "$out"
  fi
  [ "$rc" -eq 0 ] || status=1
  rm -f "$out"
done
exit $status
