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
