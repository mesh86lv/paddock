# ai_worktree: create (or reuse) a git worktree and launch ai-agent inside it.
#
# Usage from anywhere in a git checkout:
#
#   ai_worktree <task-name> [base-ref]
#
# Creates <main-repo>/.worktrees/<task-name> on a new branch
# wt/<task-name> from [base-ref] (default HEAD), then execs ai-agent
# with cwd there. Reuses an existing worktree. Adds .worktrees/ to the
# main repo's .gitignore on first use.
#
# Each invocation is its own sandbox (pasta + bwrap + pi), so N parallel
# calls in herdr panes are isolated. The git common dir is shared, which
# is what makes `git merge wt/<name>` in the main checkout work.
{
  pkgs,
  ai_agent,
}:

pkgs.writeShellApplication {
  name = "ai_worktree";
  runtimeInputs = with pkgs; [
    git
    gnugrep
    gawk
    coreutils
  ];

  text = ''
    if [ $# -lt 1 ]; then
      echo "usage: ai_worktree <task-name> [base-ref]" >&2
      exit 2
    fi
    name="$1"
    base="''${2:-HEAD}"

    if ! [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
      echo "error: task name must match ^[a-z0-9][a-z0-9-]*$ (got: $name)" >&2
      exit 2
    fi

    root="$(git rev-parse --show-toplevel 2>/dev/null)" \
      || { echo "error: not inside a git repository" >&2; exit 2; }

    # Resolve the *main* repo root even if invoked from inside a worktree,
    # so new worktrees land next to the primary checkout.
    main_root="$(git -C "$root" worktree list --porcelain 2>/dev/null \
      | awk '/^worktree / { sub(/^worktree /, ""); print; exit }')" || true
    [ -n "$main_root" ] \
      || { echo "error: cannot determine main repo root" >&2; exit 2; }

    worktrees_dir="$main_root/.worktrees"
    wt="$worktrees_dir/$name"
    branch="wt/$name"
    gitignore="$main_root/.gitignore"

    if ! grep -qxE '\.worktrees/?$' "$gitignore" 2>/dev/null; then
      printf '\n# ai_worktree: parallel worktrees\n.worktrees/\n' >> "$gitignore"
      echo "note: added .worktrees/ to $gitignore" >&2
    fi

    mkdir -p "$worktrees_dir"

    if [ -d "$wt" ]; then
      echo "reusing existing worktree: $wt" >&2
    elif git -C "$main_root" show-ref --verify --quiet "refs/heads/$branch"; then
      git -C "$main_root" worktree add "$wt" "$branch"
    else
      git -C "$main_root" worktree add -b "$branch" "$wt" "$base"
    fi

    cd "$wt"
    exec ${ai_agent}/bin/ai-agent
  '';
}
