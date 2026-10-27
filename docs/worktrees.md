# Parallel tasks with git worktrees

`ai-wt` creates a git worktree for one task and launches `ai-agent` inside
it. Use it to run several tasks at once, each in its own sandbox, and
merge results back into the main checkout by hand.

## Typical workflow

Say you want to work on two features in parallel and keep their working
trees separate, so an agent on one task cannot touch the other's files.

### 1. Start the first task

    cd ~/projects/my-project
    ai-wt feature-auth

Output on the first run:

    note: added .worktrees/ to /home/alice/projects/my-project/.gitignore
    Preparing worktree (new branch 'wt/feature-auth')
    HEAD is now at abc1234 Last commit
    prompt: _code.md
    model:  deepseek-flash
    tools:  read,grep,find,ls,edit,write,bash

You are now inside the `ai-agent` sandbox with `$PWD` set to
`~/projects/my-project/.worktrees/feature-auth`. The role sees only this
worktree's files. `.env`, `*.pem`, `AGENTS.md`, `.husky/` and the other
protected paths are handled per-worktree — a `.env` in the main checkout
is invisible to this session.

### 2. Start a second task in another herdr pane

    ai-wt feature-billing

Each pane is its own pasta netns + bwrap + pi process. They share:

- the git common dir at `~/projects/my-project/.git` — every ref, branch,
  and commit is visible to both, so `git log`, `git diff main`, and
  `git merge` from the main checkout see both worktrees;
- `~/.pi/agent/sessions/` — conversation history is shared across
  worktrees (see [security.md](security.md) — cross-project session
  leakage).

They do not share:

- the working tree (each task edits its own files);
- `~/.pi/agent/npm` (tmpfs per session, so a package install in one task
  cannot break the other);
- the network namespace, so background traffic cannot cross panes.

### 3. Work normally

Inside each pane the agent runs like it always does — pick a role,
implement, ask the user to run tests. The post-session scope check runs
`git -C .worktrees/<task> status`, so an architect in `feature-auth`
sees only its own plan files.

### 4. Exit and re-enter

Ctrl-C exits the sandbox and drops you back in the worktree directory on
the host:

    ~/projects/my-project/.worktrees/feature-auth$

Re-enter the same worktree with `ai-wt feature-auth` — it detects the
existing directory and goes straight to `ai-agent`, no new branch.

### 5. Commit inside the sandbox

The `code` role can `git add <specific paths>` but not `git commit` —
`no-git-commit-push` blocks it. It will write the suggested commit
message as text and leave the commit to you. Two options:

    # option A: from the worktree on the host
    cd ~/projects/my-project/.worktrees/feature-auth
    git add ...
    git commit -m "..."

    # option B: exit the sandbox (Ctrl-D), then commit from the host

Both work — the worktree has its own `.git` file pointing at the shared
common dir.

### 6. Merge back into the main checkout

From the main checkout (not from inside a worktree):

    cd ~/projects/my-project
    git checkout main
    git merge --no-ff wt/feature-auth

`git merge` is blocked inside the sandbox by `no-git-commit-push`. This
is deliberate — merge is the operation that decides history for the
whole repository, and it must happen on the host.

If you want help resolving conflicts, run the `merge-resolver` role
inside the worktree — it can `git rebase` but not `git merge` or
`git push`, so the final history decision stays with you:

    ai-wt feature-auth        # inside, pick _merge_resolver from the menu

### 7. Clean up

After the merge lands:

    git worktree remove .worktrees/feature-auth
    git branch -d wt/feature-auth

Use `git branch -d` (not `-D`) — it refuses to delete a branch whose work
is not yet merged. `git worktree remove` fails if the worktree has
uncommitted changes; `--force` overrides, but think first — the agent
cannot undo worktree mutations for you (`no-git-commit-push` blocks
`git worktree add/remove/...` from inside the sandbox).

### 8. Commit the `.gitignore` change once

The first `ai-wt` run appends `.worktrees/` to `.gitignore` in the main
checkout. That change sits in the main repo's working tree until you
commit it:

    git add .gitignore
    git commit -m "chore: ignore .worktrees/"

Do this once, on the first task. Subsequent `ai-wt` calls see the line
and do not touch `.gitignore` again.

## What `ai-wt` prints in each case

    # first run, no worktree, no branch
    $ ai-wt my-task
    note: added .worktrees/ to /home/alice/projects/my-project/.gitignore
    Preparing worktree (new branch 'wt/my-task')
    HEAD is now at abc1234 ...
    ... (agent starts)

    # existing worktree on disk
    $ ai-wt my-task
    reusing existing worktree: /home/alice/projects/my-project/.worktrees/my-task
    ... (agent starts)

    # worktree removed, branch still present
    $ ai-wt my-task
    Preparing worktree (checking out branch 'wt/my-task')
    ... (agent starts)

    # invoked from inside a worktree — main checkout is resolved automatically
    $ cd .worktrees/feature-auth && ai-wt my-task
    Preparing worktree (new branch 'wt/my-task')
    ...

All four end in `exec ai-agent`, so the sandbox is identical.

## Known limitations

- `.worktrees/` lives inside the main repo. It shows in
  `git worktree list`; it is added to `.gitignore` on first use.
- `~/.pi/agent/sessions/` is shared between parallel runs (privacy, not
  a boundary).
- Root-protected files (`AGENTS.md`, `.envrc`, `.husky`, …) are
  protected only inside the worktree they exist in. They are not copied
  into a fresh worktree — a new worktree starts from the branch ref and
  only sees files that are committed on that branch.
- Secret masking (`.env`, `*.pem`, …) is done by scanning
  `$PROJECT_DIR` at launch, so a `.env` that a task creates after the
  sandbox starts is not masked.
