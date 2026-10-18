# Parallel tasks with git worktrees

`ai-wt` creates a git worktree for one task and launches `ai-agent` inside
it. Use it to run several tasks in parallel, each in its own sandbox, and
merge the results back into the main checkout by hand.

## Usage

    cd /path/to/repo
    ai-wt <task-name> [base-ref]

- `<task-name>` — kebab-case, `[a-z0-9][a-z0-9-]*`. Becomes the worktree
  directory and the branch suffix.
- `[base-ref]` — what to branch from (default `HEAD`).

First call creates `.worktrees/<task-name>` on a new branch
`wt/<task-name>`, adds `.worktrees/` to `.gitignore` (once), then execs
`ai-agent`. Subsequent calls with the same name reuse the worktree.

## Parallel runs

Open N herdr panes, in each:

    ai-wt task-a
    ai-wt task-b
    ai-wt task-c

Each is a separate pasta netns + bwrap + pi process. `~/.pi/agent/npm`
is tmpfs per session; `~/.pi/agent/sessions/` is shared across all
worktrees (see [security.md](security.md) — cross-project session
leakage).

## Merging back

The agent cannot merge — `no-git-commit-push` blocks `git merge` and
`git worktree *`. On the host, in the main checkout:

    git merge --no-ff wt/task-a
    git worktree remove .worktrees/task-a
    git branch -d wt/task-a

Or run the `merge-resolver` role inside the worktree: it handles rebase
and conflicts and leaves push to you.

## Known limitations

- `.worktrees/` lives inside the main repo. It shows in
  `git worktree list`; it is added to `.gitignore` on first use.
- `~/.pi/agent/sessions/` is shared between parallel runs.
- Root-protected files (`AGENTS.md`, `.envrc`, `.husky`, …) are
  protected only inside the worktree they exist in. They are not copied
  into a fresh worktree.
