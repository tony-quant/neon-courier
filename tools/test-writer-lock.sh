#!/usr/bin/env bash
# tools/test-writer-lock.sh — tests for scripts/writer_lock.sh using a scratch lock directory.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
L="$HERE/scripts/writer_lock.sh"
T="$(mktemp -d)"
export WRITER_LOCK_DIR="$T/writer.lock.d"
fail=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
trap 'rm -rf "$T"' EXIT

# 1. Free lock: a writer runs and releases.
"$L" run commit -- true && [ ! -d "$WRITER_LOCK_DIR" ] && ok "free lock: writer runs and releases" || bad "free lock"

# 2. Two simultaneous writers: the second exits at once (3) and names the holder.
"$L" run backup -- sleep 4 &
H=$!
for i in $(seq 1 50); do [ -f "$WRITER_LOCK_DIR/holder.env" ] && break; sleep 0.1; done
out=$("$L" run notify -- echo nope 2>&1); rc=$?
[ "$rc" = 3 ] && echo "$out" | grep -q "HELD" && echo "$out" | grep -q "doing:  backup" \
  && ok "second writer exits at once and names the holder (rc 3)" || bad "second writer rc=$rc out=$out"
wait $H
[ ! -d "$WRITER_LOCK_DIR" ] && ok "holder releases on normal exit" || bad "lock left after normal exit"

# 3. Killed holder: lock stays, is reported as STALE (rc 4), and is NOT taken over.
"$L" run commit -- sleep 30 &
W=$!
for i in $(seq 1 50); do [ -f "$WRITER_LOCK_DIR/holder.env" ] && break; sleep 0.1; done
HOLDER_PID=$(sed -n 's/^pid=//p' "$WRITER_LOCK_DIR/holder.env")
kill -9 "$W" 2>/dev/null; kill -9 "$HOLDER_PID" 2>/dev/null; pkill -9 -P "$W" 2>/dev/null
wait "$W" 2>/dev/null
out=$("$L" run push -- echo nope 2>&1); rc=$?
[ "$rc" = 4 ] && echo "$out" | grep -q "STALE" && [ -d "$WRITER_LOCK_DIR" ] \
  && ok "killed holder: STALE reported (rc 4), lock not taken over" || bad "stale rc=$rc out=$out"

# 4. Clear removes only the stale lock, then the lock is free again.
"$L" clear >/dev/null 2>&1 && [ ! -d "$WRITER_LOCK_DIR" ] && ok "clear removes a stale lock" || bad "clear"
"$L" run push -- true && ok "lock usable again after clear" || bad "lock after clear"

# 5. A live lock cannot be cleared.
"$L" run commit -- sleep 3 &
W2=$!
for i in $(seq 1 50); do [ -f "$WRITER_LOCK_DIR/holder.env" ] && break; sleep 0.1; done
"$L" clear >/dev/null 2>&1; rc=$?
[ "$rc" = 3 ] && [ -d "$WRITER_LOCK_DIR" ] && ok "clear refuses a live lock (rc 3)" || bad "clear live rc=$rc"
wait $W2

[ "$fail" = 0 ] && echo "writer_lock tests: ALL PASS" || { echo "writer_lock tests: FAILED"; exit 1; }
