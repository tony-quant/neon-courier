#!/usr/bin/env bash
# writer_lock.sh (platformer): the one lock for every writer of this repo (commit, backup, notify, publish).
#   scripts/writer_lock.sh run <action> -- <command> [args...]   take the lock, run the command, release on exit
#   scripts/writer_lock.sh check                                  exit 0 if QP_WRITER_TOKEN is the live holder's token
#   scripts/writer_lock.sh status                                 print the holder, or FREE
#   scripts/writer_lock.sh clear                                  remove a STALE lock (holder not running); never a live one
# The lock is the directory $WRITER_LOCK_DIR (default ~/.config/platformer/writer.lock.d, outside the repo), created with
# mkdir (atomic). holder.env inside: pid, start ticks, command name, token, session, action, start time, cwd.
#   - holder live (same pid, start ticks and command name)  -> exit 3, the holder is printed, nothing waits;
#   - holder dead (crashed or killed)                       -> exit 4, STALE is printed, the lock is NOT taken over.
#     Only 'clear' removes it, and only after the holder is confirmed gone.
#   - a child writer gets the token in QP_WRITER_TOKEN; 'run' inside a child holding the live token runs the command
#     without taking the lock again.
set -u
LOCK="${WRITER_LOCK_DIR:-$HOME/.config/platformer/writer.lock.d}"
HOLDER="$LOCK/holder.env"
TOKEN=""

pst()   { sed 's/^.*) //' "/proc/$1/stat" 2>/dev/null | awk '{print $20}'; }   # start ticks (stat field 22)
pcomm() { cat "/proc/$1/comm" 2>/dev/null; }
field() { sed -n "s/^$1=//p" "$HOLDER" 2>/dev/null | head -1; }

# none | unrecorded (lock dir made, holder.env not written yet) | live | dead
state() {
  [ -d "$LOCK" ] || { echo none; return; }
  [ -f "$HOLDER" ] || { echo unrecorded; return; }
  local p t c; p=$(field pid); t=$(field ticks); c=$(field comm)
  if [ -n "$p" ] && [ -d "/proc/$p" ] && [ "$(pst "$p")" = "$t" ] && [ "$(pcomm "$p")" = "$c" ]; then echo live; else echo dead; fi
}

describe() {
  echo "  holder: session '$(field session)', pid $(field pid) ($(field comm)), started $(field started)"
  echo "  doing:  $(field action)   (cwd $(field cwd))"
}

acquire() {
  local action="$1" ticks comm
  if mkdir "$LOCK" 2>/dev/null; then
    TOKEN="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    ticks=$(pst $$); comm=$(pcomm $$)
    { echo "pid=$$"; echo "ticks=$ticks"; echo "comm=$comm"; echo "token=$TOKEN"; echo "session=${QP_SESSION:-unnamed}"
      echo "action=$action"; echo "started=$(date '+%F %T')"; echo "cwd=$PWD"; } > "$HOLDER.tmp.$$" && mv -f "$HOLDER.tmp.$$" "$HOLDER"
    return 0
  fi
  case "$(state)" in
    live)       echo "writer_lock: HELD. Not waiting. Retry later, or ask the holder:" >&2; describe >&2; return 3 ;;
    unrecorded) echo "writer_lock: HELD (the holder is still writing its record). Not waiting; retry in a few seconds." >&2; return 3 ;;
    dead)       echo "writer_lock: STALE lock. The holder is not running (crashed or killed). NOT taken over:" >&2; describe >&2
                echo "  Check that the holder is gone, then run: scripts/writer_lock.sh clear" >&2; return 4 ;;
  esac
}

release() { [ -n "$TOKEN" ] && [ "$(field token)" = "$TOKEN" ] && rm -rf "$LOCK"; }

cmd_check() { [ -n "${QP_WRITER_TOKEN:-}" ] && [ "$(state)" = live ] && [ "$(field token)" = "$QP_WRITER_TOKEN" ]; }

cmd_run() {
  local action="${1:-}"; shift 2>/dev/null; [ "${1:-}" = "--" ] && shift
  [ -n "$action" ] && [ $# -gt 0 ] || { echo "usage: writer_lock.sh run <action> -- <command> [args...]" >&2; return 2; }
  if cmd_check; then "$@"; return $?; fi
  acquire "$action" || return $?
  trap release EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  QP_WRITER_TOKEN="$TOKEN" "$@"; local rc=$?
  exit "$rc"
}

cmd_clear() {
  case "$(state)" in
    none) echo "writer_lock: FREE, nothing to clear"; return 0 ;;
    live) echo "writer_lock: refusing to clear a LIVE lock:" >&2; describe >&2; return 3 ;;
    *)    echo "writer_lock: clearing a stale lock (holder not running):" >&2; describe >&2; rm -rf "$LOCK"; echo "writer_lock: cleared"; return 0 ;;
  esac
}

case "${1:-status}" in
  run)    shift; cmd_run "$@"; exit $? ;;
  check)  cmd_check; exit $? ;;
  clear)  cmd_clear; exit $? ;;
  status) case "$(state)" in none) echo "writer_lock: FREE" ;; *) echo "writer_lock: $(state)"; describe ;; esac; exit 0 ;;
  *)      echo "usage: writer_lock.sh run <action> -- <command> | check | status | clear" >&2; exit 2 ;;
esac
