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

## Operating rules (applies to every task)

Before any work, check the list below and report in one line any item this task depends on that is marked NOT VERIFIED. Do not start the task until that report is given.

Verified machine facts (from command output, this PC):
- Windows 10.0.26300.9818. WSL2, Ubuntu, kernel 6.18.33.2.
- Python 3.11.16. Node v22.11.0 lives in ~/.local/node/bin and is NOT on PATH. Export the path before any Node command.
- 12 CPU cores. WSL sees about 9 GB RAM. .wslconfig caps WSL at 10 GB RAM, 4 GB swap.
- Google Drive mapped at /mnt/g/My Drive (personal account, owner-confirmed).
- Run cmd.exe commands from /mnt/c to avoid the UNC warning.

NOT VERIFIED:
- Heavy-job cap of 4.5 GB per job (reported by vectorbt, not re-checked).
- Scheduled tasks run status (names verified, runs not checked).
- NVIDIA GPU: owner-stated. No project uses it.

Hard rules:
- A run that hits a cap is inconclusive, never a pass.
- Nothing starts without the owner's go.
- Prompts go in copyable code blocks, with a feasibility line above each.
- Facts come from command output. Anything from memory is labeled.
- A test that cannot fail is not a test.

## Publish rule (applies to every task)

- The only way the live game changes is a push to the platformer branch. The GitHub Action runs the tests and deploys only if they pass.
- No session may upload files by hand, build a zip for upload, or edit the neon-courier repo on GitHub directly.
- Never push to main of neon-courier. Never force-push.
- Before any push to platformer, run the full test suite locally and report the counts. Do not push if any test fails.
- Every push to platformer publishes to the owner's live site. Push only changes the owner has asked for in the current task.
- After a deploy, check the served build code at https://tony-quant.github.io/neon-courier/js/version.js and report it. If it does not match the commit's build code, stop and report. Do not push again to force it.
- If the Action fails, stop and report the error text. Retry at most once.
- If a session cannot push (credentials or permission), it must say so and stop. It must not work around this with a manual upload.
