// Blocks commit-producing and destructive git commands at the bash tool
// level.
//
// Blocked:
//   commit, commit-tree, cherry-pick, revert, am   (produce commits)
//   push
//   reset --hard, clean -f, checkout -- / .        (destroy work)
//   restore without --staged, stash drop/clear
//   branch -D, merge (except --abort)
//
// This is a safety net against accidental commands, not a security
// boundary. A bypass through `sh -c` with string concatenation, an alias,
// or an absolute path to git from the nix store is not caught by the
// regex. The real protection against push is a read-only deploy key and
// the absence of GH_TOKEN in the sandbox.
//
// Verified against pi 0.84.2 and 1.1.0. The tool call hook uses
// pi.on("tool_call", ...) with a `reason` field, not `message`.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Global git options that can appear between `git` and the subcommand:
// -C dir, -c key=value, --git-dir x, --work-tree x, --namespace x,
// --no-pager, --foo=bar, -p. Values may be quoted to allow spaces.
const GIT_OPTS = String.raw`(?:\s+(?:-[Cc]\s+(?:\S+|"[^"]*"|'[^']*')|--(?:git-dir|work-tree|namespace)\s+\S+|--[\w-]+(?:=\S+)?|-\w))*`;
const REST = String.raw`[^;&|\n]*`;

// (?![\w-]) instead of \b so `git merge-base` and `git commit-graph`
// do not match `merge` and `commit`.
const gitSub = (sub: string): RegExp =>
  new RegExp(String.raw`\bgit${GIT_OPTS}\s+(?:${sub})(?![\w-])`, "i");

type Rule = { re: RegExp; reason: string };

const RULES: Rule[] = [
  {
    re: gitSub("commit|commit-tree|cherry-pick|revert|am"),
    reason: "produces a commit; the user commits manually",
  },
  {
    re: gitSub("push"),
    reason: "only the user pushes, by hand",
  },
  {
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+reset(?![\w-])${REST}--hard(?![\w-])`,
      "i",
    ),
    reason: "reset --hard discards uncommitted work",
  },
  {
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+clean(?![\w-])${REST}\s(?:-\w*f\w*|--force)(?![\w-])`,
      "i",
    ),
    reason: "clean -f deletes untracked files permanently",
  },
  {
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+checkout(?![\w-])${REST}\s(?:--|\.)(?:\s|$)`,
      "i",
    ),
    reason: "checkout -- or checkout . reverts uncommitted changes",
  },
  {
    // Allow restore only with --staged and without --worktree / -W.
    // Without --staged it rewrites the working tree, which we do not want.
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+restore(?![\w-])(?=.*--staged)(?!.*(?:--worktree|-W))`,
      "i",
    ),
    reason:
      "restore without --staged (or with --worktree) reverts uncommitted changes",
  },
  {
    re: gitSub(String.raw`stash\s+(?:drop|clear)`),
    reason: "stash drop or clear discards saved work",
  },
  {
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+branch(?![\w-])${REST}\s-\w*D(?![\w-])`,
    ),
    reason: "branch -D deletes a branch without a merge check",
  },
  {
    // merge --abort is harmless. Block only merges that produce a commit.
    re: new RegExp(
      String.raw`\bgit${GIT_OPTS}\s+merge(?![\w-])(?!${REST}--abort)`,
      "i",
    ),
    reason: "merge produces a commit; the user commits manually",
  },
];

export function findViolation(command: string): Rule | undefined {
  return RULES.find((rule) => rule.re.test(command));
}

export default function noGitCommitPush(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return undefined;
    const command: string = event.input?.command ?? "";
    const violation = findViolation(command);
    if (!violation) return undefined;
    return {
      block: true,
      reason:
        `Blocked by no-git-commit-push: ${violation.reason}. ` +
        "You can suggest the command or commit message as text, " +
        "but do not run it.",
    };
  });
}
