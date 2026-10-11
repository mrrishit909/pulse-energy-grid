#!/bin/bash
# Deploys site/dist to the gh-pages branch and ensures the repo's GitHub Pages
# source is set to that branch (not main/root, which would serve this repo's
# README through Jekyll instead of the Vite build - see git history for why
# this is a separate script from projects-site/publish.sh, which hardcodes
# branch=main/path=/ and is correct for THAT repo, not this one).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:?usage: deploy_site_pages.sh <repo-name>}"
USER="mrrishit909"
EMAIL="73118361+mrrishit909@users.noreply.github.com"

echo "== building site/ =="
(cd site && npm run build)
test -d site/dist || { echo "STOP: site/dist missing after build"; exit 1; }
touch site/dist/.nojekyll

TOKEN=$(printf 'protocol=https\nhost=github.com\nusername=%s\n\n' "$USER" | git credential fill | sed -n 's/^password=//p')
api() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

WORKTREE=$(mktemp -d)
echo "== preparing gh-pages worktree at $WORKTREE =="
if git show-ref --verify --quiet refs/remotes/origin/gh-pages; then
  git worktree add -B gh-pages "$WORKTREE" origin/gh-pages
else
  git worktree add --detach "$WORKTREE"
  (cd "$WORKTREE" && git checkout --orphan gh-pages && git rm -rf . >/dev/null 2>&1 || true)
fi

rm -rf "$WORKTREE"/*
cp -r site/dist/. "$WORKTREE"/
touch "$WORKTREE"/.nojekyll

(
  cd "$WORKTREE"
  git config user.name "Rishit Raj Mathur"
  git config user.email "$EMAIL"
  git add -A
  if git diff --cached --quiet; then
    echo "No changes to deploy."
  else
    git commit -q -m "Deploy site/dist ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
    git push origin gh-pages:gh-pages
  fi
)
git worktree remove --force "$WORKTREE"

echo "== ensuring GitHub Pages source is gh-pages/root =="
code=$(api -o /dev/null -w '%{http_code}' "https://api.github.com/repos/$USER/$REPO/pages")
if [ "$code" = 404 ]; then
  api -X POST "https://api.github.com/repos/$USER/$REPO/pages" -o /dev/null -w "create pages -> HTTP %{http_code}\n" \
    -d '{"source":{"branch":"gh-pages","path":"/"}}'
else
  api -X PUT "https://api.github.com/repos/$USER/$REPO/pages" -o /dev/null -w "update pages -> HTTP %{http_code}\n" \
    -d '{"source":{"branch":"gh-pages","path":"/"}}'
fi

echo "Deployed. Expected live URL: https://$USER.github.io/$REPO/"
