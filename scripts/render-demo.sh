#!/usr/bin/env bash
# Capture the actual Pi panel rather than maintaining a second drawing of its UI.
set -euo pipefail
cd "$(dirname "$0")/.."
temporary=$(mktemp -d)
socket="$temporary/tmux.sock"
# The default matches CI's pinned SDK; an explicit binary can check another installed Pi.
printf -v pi_command '%q' "${PI_DEMO_BIN:-./node_modules/.bin/pi}"
cleanup() {
  tmux -S "$socket" kill-server 2>/dev/null || true
  rm -rf "$temporary"
}
trap cleanup EXIT
mkdir "$temporary/agent"
printf '%s\n' '{"theme":"dark"}' > "$temporary/agent/settings.json"
# A private tmux server and Pi agent directory leave the user's sessions and settings untouched.
# Force truecolor, including Chalk's bold styles, independently of inherited CI color policies.
tmux -S "$socket" -f /dev/null new-session -d -x 124 -y 52 -c "$PWD" \
  "env -u PI_PACKAGE_DIR -u NO_COLOR PI_CODING_AGENT_DIR='$temporary/agent' PI_OFFLINE=1 COLORTERM=truecolor FORCE_COLOR=3 $pi_command --no-session --no-tools --no-context-files --no-extensions --no-skills --no-prompt-templates --no-themes -e extensions/actor-subagents/index.ts -e scripts/demo.ts" \; set-option -g remain-on-exit on
wait_for_screen() {
  for attempt in $(seq 1 80); do
    tmux -S "$socket" capture-pane -p > "$temporary/screen.txt"
    if grep -q "$1" "$temporary/screen.txt"; then return; fi
    if [ "$attempt" = 80 ]; then
      printf 'Pi did not render %s:\n' "$1" >&2
      cat "$temporary/screen.txt" >&2
      exit 1
    fi
    sleep 0.25
  done
}
# Wait for the first rendered footer, so input cannot arrive before raw mode starts.
wait_for_screen '0.0%/0'
tmux -S "$socket" send-keys -l '/demo'
tmux -S "$socket" send-keys Enter
wait_for_screen 'Please also check the empty-input case'
# Capture the panel's actual position: regular-mode Pi can use fewer than all terminal rows.
# Preserve trailing cells so selected rows and message backgrounds retain their full width.
tmux -S "$socket" capture-pane -peN | \
  awk '/subagents .*3\/8 agents/ { panel=1 } panel { print; if (++lines == 26) exit }' \
  > "$temporary/panel.ansi"
if ! grep -q 'subagents .*3/8 agents' "$temporary/panel.ansi"; then
  printf '%s\n' 'The terminal capture does not contain the demo panel.' >&2
  exit 1
fi
# Feed captured bytes directly so SVG generation needs no controlling terminal.
freeze --config base --language ansi --background '#18181b' --font.family monospace \
  --font.size 16 --line-height 1.3 --padding 16 --margin 0 --border.radius 0 \
  --output docs/subagents.svg < "$temporary/panel.ansi"
printf '%s\n' 'Rendered docs/subagents.svg from the real panel.'
