#!/usr/bin/env bash
# backup.sh <commit>: copy the files of a commit to G:\My Drive\neon_courier\backups\<short commit id>\ and verify
# every file by sha256 (the copy read back vs the same file from git). Any mismatch is a failure.
# If G: is not mapped, it reports NOT VERIFIED and exits 5.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
COMMIT="$(git rev-parse --short=7 "${1:-HEAD}")"
DRIVE="/mnt/g/My Drive"
if [ ! -d "$DRIVE" ]; then echo "backup $COMMIT: NOT VERIFIED (G: is not mapped: $DRIVE missing)"; exit 5; fi
DEST="$DRIVE/neon_courier/backups/$COMMIT"
mkdir -p "$DEST"
FILES="$(git ls-tree -r --name-only "$COMMIT")"
while IFS= read -r f; do
  mkdir -p "$DEST/$(dirname "$f")"
  git show "$COMMIT:$f" > "$DEST/$f"
done <<< "$FILES"
n=0; bad=0
while IFS= read -r f; do
  n=$((n+1))
  want="$(git show "$COMMIT:$f" | sha256sum | cut -d' ' -f1)"
  got="$(sha256sum "$DEST/$f" | cut -d' ' -f1)"
  if [ "$want" != "$got" ]; then echo "backup $COMMIT: MISMATCH $f"; bad=$((bad+1)); fi
done <<< "$FILES"
if [ "$bad" = 0 ]; then echo "backup $COMMIT: PASS ($n files verified by sha256) -> $DEST"; exit 0; fi
echo "backup $COMMIT: FAIL ($bad mismatches)"; exit 1
