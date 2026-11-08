# Rules for working on Neon Courier

- Only one session edits this repo at a time. This is enforced by `scripts/writer_lock.sh`: every commit, backup,
  notification and publish takes that lock first. Do not write to the repo while the lock is held by another session.
- Nothing ships without the full test suite passing (`npm test`, which also runs the reachability check).
- The reachability check (`tools/reachability.js`) is the only reachability test. Do not add a search over game
  states; it was tried and abandoned because it does not finish.
- Backup (copy to Google Drive) and notification (ntfy push) run after every finished task.
- A coin, checkpoint or exit that the check cannot reach is a failure, never a warning. A check that hits a limit
  (time, node count, memory) reports "inconclusive", which counts as a failure.
- Do not edit the research repo (`~/quant-project`) from this project.
