# Roles

Each role is defined by a file in `prompts/`. The `PI_ROLE` slug is what
`permission-gate` enforces.

## Reference

| Slug                 | Model | Tools                                                         | Enforcement                            |
| -------------------- | ----- | ------------------------------------------------------------- | -------------------------------------- |
| orchestrator         | flash | read, grep, find, ls, subagent, subagent_supervisor, ask_user | tool-block: edit, write, bash          |
| architect            | flash | read, grep, find, ls, edit, write                             | path-gate: plans/**/*.md, bash blocked |
| code                 | flash | read, grep, find, ls, edit, write, bash                       | none                                   |
| code-reviewer        | flash | read, grep, find, ls                                          | tool-block: edit, write, bash          |
| debug                | flash | read, grep, find, ls, edit, write, bash                       | none                                   |
| devops               | flash | read, grep, find, ls, edit, write, bash                       | prompt-only approval gate              |
| documentation-writer | flash | read, grep, find, ls, edit, write, bash                       | path-gate: docs, *.md                  |
| merge-resolver       | flash | read, grep, find, ls, edit, write, bash                       | none, rebase allowed                   |
| project-research     | flash | read, grep, find, ls                                          | tool-block: edit, write, bash          |
| security-review      | flash | read, grep, find, ls                                          | tool-block: edit, write, bash          |
| test-engineer        | flash | read, grep, find, ls, bash, edit, write                       | path-gate: tests, _.test._             |

## Bash policies, all roles

Independent of role, bash calls are filtered by two extensions:

`no-git-commit-push` blocks `git commit`, `git push`, `git reset --hard`,
`git clean -f`, `git checkout --`, `git restore` without `--staged`,
`git stash drop` and `clear`, `git branch -D`, `git merge` except
`--abort`, and `git worktree add/remove/prune/move/lock/unlock/repair`
(worktrees are managed by `ai-wt` on the host; only `git worktree list`
is allowed from inside the sandbox).

`no-heavy-commands` blocks `npm`, `pnpm`, `yarn`, `bun`, `npx`, `pnpx`,
`bunx`, `cargo`, `go`, `pytest`, `ruff`, `mypy`, `uv`, `poetry`, `pip`,
`docker`, `kubectl`, `helm`, `terraform`, `make`, `just`, `tsc`, `eslint`,
`vitest`, `jest`, and `node --test`.

Read-only shell is never blocked. That includes `grep`, `cat`, `find`,
`ls`, `git status`, `git diff`, and `git log`.

## Adding a role

1. Create `prompts/_my-role.md` with a frontmatter block and a
   `<!-- PI_ROLE: my-role -->` marker.
2. Add the filename to the `home.file` list in `modules/ai-agent.nix`.
3. If the role needs tool or path restrictions, add an entry to
   `ROLE_BLOCKED_TOOLS` or `ROLE_ALLOWED_PATTERNS` in
   `extensions/permission-gate.ts`.
4. If the role has a path restriction and bash access, add a matching
   `SCOPE_RE` case in `modules/ai-agent.nix`. That runs a post-session
   check on changed files, because bash bypasses `permission-gate`.
5. Run `home-manager switch` and reload pi.
