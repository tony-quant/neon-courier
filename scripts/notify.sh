#!/usr/bin/env bash
# notify.sh <task> <PASS|FAIL> [message]: one push to the project's ntfy topic.
# The topic is read from ~/.config/platformer/notify.env (QP_NTFY_TOPIC) and never printed.
# If the env file or ntfy cannot be reached, it reports NOT VERIFIED and exits non-zero.
set -u
ENV="$HOME/.config/platformer/notify.env"
[ -f "$ENV" ] || { echo "notify: NOT VERIFIED (no $ENV)"; exit 5; }
QP_NTFY_TOPIC=""
. "$ENV"
[ -n "$QP_NTFY_TOPIC" ] || { echo "notify: NOT VERIFIED (QP_NTFY_TOPIC is empty)"; exit 5; }
task="${1:?task name}"; verdict="${2:?PASS or FAIL}"; msg="${3:-}"
code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -H "Title: [$verdict] $task" -d "$msg" "https://ntfy.sh/$QP_NTFY_TOPIC" 2>/dev/null)"
if [ "$code" = 200 ]; then echo "notify: sent [$verdict] $task"; exit 0; fi
echo "notify: NOT VERIFIED (ntfy answered '$code' or was unreachable)"; exit 6
