#!/usr/bin/env bash
# PostToolUse hook for Edit|Write. Formats, lints and typechecks the edited file.
# Steps run in order so ESLint never reads a file Prettier is still writing.
# Problems go to stderr with exit 2, which is the only way Claude sees them.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')

# Only files in this repo. Plans and memory live outside it.
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
[ -f "$file" ] || exit 0

cd "$root" || exit 0
bin="$root/node_modules/.bin"
problems=""

# ESLint isn't installed until #24 Task 3, so these two steps wait for it
has_eslint() { [ -x "$bin/eslint" ] && [ -f eslint.config.js ]; }

case "$file" in
  *.ts | *.tsx)
    if has_eslint && [ -n "$(node .claude/scripts/check-mantine-a11y.mjs "$file")" ]; then
      # The script appends to the Mantine mapping without formatting it
      "$bin/prettier" --write --log-level warn eslint.config.js >/dev/null
      echo "Added a Mantine component to the jsx-a11y mapping in eslint.config.js"
    fi
    ;;
esac

if ! out=$("$bin/prettier" --write --ignore-unknown --log-level warn "$file" 2>&1); then
  problems+="Prettier could not format $file:"$'\n'"$out"$'\n\n'
fi

case "$file" in
  *.ts | *.tsx | *.js | *.mjs)
    if has_eslint && ! out=$("$bin/eslint" --max-warnings=0 --no-warn-ignored "$file" 2>&1); then
      problems+="ESLint:"$'\n'"$(printf '%s\n' "$out" | tail -30)"$'\n\n'
    fi
    ;;
esac

case "$file" in
  *.ts | *.tsx | */tsconfig.json)
    if ! out=$(npm run -s typecheck 2>&1); then
      problems+="Typecheck:"$'\n'"$(printf '%s\n' "$out" | tail -30)"$'\n'
    fi
    ;;
esac

if [ -n "$problems" ]; then
  printf '%s' "$problems" >&2
  exit 2
fi
