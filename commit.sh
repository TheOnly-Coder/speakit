#!/usr/bin/env bash
#
# Commit everything to GitHub under a name you choose.
#   ./commit.sh "added voice chat"
#   ./commit.sh            # asks you for the name
set -euo pipefail
cd "$(dirname "$0")"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "not a git repo — run this inside your project folder"; exit 1; }

if [ $# -ge 1 ]; then
  MSG="$*"
else
  read -rp "Commit name: " MSG
fi
if [ -z "${MSG// }" ]; then echo "empty name — aborting, nothing committed"; exit 1; fi

git add -A
if git diff --cached --quiet; then echo "nothing changed — nothing to commit"; exit 0; fi

git commit -m "$MSG"
BRANCH="$(git branch --show-current)"
git push -u origin "$BRANCH"
echo "pushed '$MSG' to $BRANCH ✓ (Render redeploys automatically)"
