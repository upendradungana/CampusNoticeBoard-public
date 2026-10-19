#!/bin/sh
# scripts/summarise.sh
# Purpose: Summarise a saved availability-monitor log.
# Usage:   sh scripts/summarise.sh <monitor-log>
# Input line format: <ISO-8601 timestamp> <OK|FAIL> <response body or error>
# Portable POSIX sh + busybox/GNU coreutils (runs unchanged inside alpine).
set -eu

if [ "$#" -ne 1 ]; then echo "usage: $0 <monitor-log>" >&2; exit 2; fi
LOG="$1"
if [ ! -r "$LOG" ]; then echo "error: cannot read $LOG" >&2; exit 2; fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# normalise CRLF and keep only well-formed monitor lines (ignores partial first/last lines)
tr -d '\r' < "$LOG" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z (OK|FAIL)( |$)' > "$TMP" || true

TOTAL=$(wc -l < "$TMP" | tr -d ' ')
FAILED=$(grep -c -E '^[^ ]+ FAIL' "$TMP" || true)
FIRST=$(head -n 1 "$TMP" | cut -d' ' -f1)
LAST=$(tail -n 1 "$TMP" | cut -d' ' -f1)

echo "Log file         : $LOG"
echo "Total requests   : $TOTAL"
echo "Failed requests  : $FAILED"
echo "First timestamp  : ${FIRST:-n/a}"
echo "Last timestamp   : ${LAST:-n/a}"
if [ "$FAILED" -gt 0 ]; then
  echo "First failure    : $(grep -E '^[^ ]+ FAIL' "$TMP" | head -n 1 | cut -d' ' -f1)"
  echo "Last failure     : $(grep -E '^[^ ]+ FAIL' "$TMP" | tail -n 1 | cut -d' ' -f1)"
fi
echo "Student id(s)    : $(grep ' OK ' "$TMP" | sed -n 's/.*"student":"\([^"]*\)".*/\1/p' | sort -u | tr '\n' ' ')"
echo "Responses per version value (count, first seen, last seen):"
grep ' OK ' "$TMP" \
  | sed -n 's/^\([^ ]*\) OK .*"version":"\([^"]*\)".*/\1 \2/p' \
  | awk '{ c[$2]++; if (!($2 in f)) f[$2]=$1; l[$2]=$1 }
         END { for (v in c) printf "  %-14s %6d   first=%s  last=%s\n", v, c[v], f[v], l[v] }' \
  | sort
