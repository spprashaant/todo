#!/usr/bin/env bash
# Sets up vendor/todomvc, which tools/suite.sh needs and git ignores: TodoMVC's repository at the commit
# the suite was verified against, with its test dependencies (Cypress) installed. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMVC="$ROOT/vendor/todomvc"
COMMIT=ff43b02e59dfa604386bb382034b2cd07c2bcd8a

if [ ! -d "$TMVC/.git" ]; then
  mkdir -p "$ROOT/vendor"
  git clone https://github.com/tastejs/todomvc.git "$TMVC"
fi
git -C "$TMVC" checkout --quiet "$COMMIT"
(cd "$TMVC" && npm install)
echo "vendor/todomvc ready. Run: bash tools/suite.sh <who>"
