// Blocks heavy shell commands at the bash tool level.
//
// Tests, builds, linters, installs, migrations, container orchestration,
// and infrastructure tools are excluded. The user runs them by hand to
// keep their output out of the model context and to keep the decision of
// "is this green" with a person.
//
// Read-only shell is never blocked: grep, cat, find, ls, git status,
// git diff, git log all pass through.
//
// Every pattern is anchored to the start of a command or a command
// separator (;, |, &). This is deliberate: `cat jest.config.js` and
// `grep "npm install" README.md` must not be blocked. Mentioning a
// command name in an argument is not the same as running it.
//
// Pairs with no-git-commit-push.ts (commit and destructive git) and
// permission-gate.ts (roles and edit/write).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Rule = { re: RegExp; reason: string };

// Command start: either beginning of line or a shell separator. The `m`
// flag makes ^ match each line, so multi-line bash blocks work.
const CMD_START = String.raw`(?:^|[|;&]\s*)`;

const rule = (body: string, flags = "im"): RegExp =>
  new RegExp(CMD_START + body, flags);

const RULES: Rule[] = [
  {
    // npx, pnpx, bunx fetch and run a package from the registry.
    // There is no read-only form: even `npx --version` downloads.
    re: rule(String.raw`(?:npx|pnpx|bunx)\s+\S+`),
    reason:
      "npx/pnpx/bunx (fetch and run a package); the user runs it by hand",
  },
  {
    // yarn dlx and pnpm dlx are the same as npx, for yarn and pnpm.
    re: rule(String.raw`(?:yarn|pnpm)\s+dlx\s+\S+`),
    reason:
      "yarn/pnpm dlx (fetch and run a package); the user runs it by hand",
  },
  {
    // npm, pnpm, yarn, bun: read-only subcommands (ls, view, why, ...) pass.
    re: rule(
      String.raw`(?:npm|pnpm|yarn|bun)\s+(?!(?:ls|list|view|info|why|outdated|ping|help|--version|-v)\b)\S+`,
    ),
    reason:
      "package-manager command (install/run/test/build); the user runs it by hand",
  },
  {
    // cargo: --version and help pass, everything else is blocked.
    re: rule(String.raw`cargo\s+(?!(?:--version|-V|--help|help)\b)\S+`),
    reason: "cargo (build/test/check/clippy/install); the user runs it by hand",
  },
  {
    re: rule(
      String.raw`(?:pytest|ruff|mypy|flake8|black|isort|pyright)(?:\s|$)`,
    ),
    reason: "linter or test runner; the user runs it by hand",
  },
  {
    re: rule(
      String.raw`uv\s+(?:run|sync|add|remove|pip|lock|build|venv|tool|python|export|tree)\b`,
    ),
    reason: "uv (install or run); the user runs it by hand",
  },
  {
    re: rule(String.raw`(?:pip|pip3)\s+(?:install|uninstall|download|wheel)\b`),
    reason: "pip install; the user runs it by hand",
  },
  {
    re: rule(
      String.raw`poetry\s+(?:install|add|remove|update|lock|build|run|shell)\b`,
    ),
    reason: "poetry (install or run); the user runs it by hand",
  },
  {
    re: rule(
      String.raw`go\s+(?:test|build|run|get|install|generate|vet|mod\s+(?:tidy|download|vendor)|work)\b`,
    ),
    reason: "go (build/test/install); the user runs it by hand",
  },
  {
    // docker and podman: ps, logs, inspect, version pass.
    re: rule(
      String.raw`(?:docker|podman)\s+(?:build|run|compose|push|pull|exec|rm|rmi|stop|kill|start|create|volume|network|system)\b`,
    ),
    reason: "docker/podman (build or run); the user runs it by hand",
  },
  {
    re: rule(String.raw`docker-compose\s+\S+`),
    reason: "docker-compose; the user runs it by hand",
  },
  {
    // kubectl, helm, terraform, pulumi, ansible: only mutating subcommands
    // are blocked. get, describe, logs, plan pass.
    re: rule(
      String.raw`(?:kubectl|helm|terraform|pulumi|ansible|ansible-playbook)\s+(?:apply|create|delete|edit|patch|replace|install|upgrade|uninstall|destroy|rollout|scale|exec|run)\b`,
    ),
    reason:
      "mutating infrastructure command; the user runs it by hand (devops approval gate)",
  },
  {
    re: rule(String.raw`(?:make|just)\s+(?!--version|-v|help)\S+`),
    reason: "make or just (build/test); the user runs it by hand",
  },
  {
    // Node's built-in test runner. Plain `node -e "..."` still passes.
    re: rule(String.raw`node\s+--test(?:\s|$)`),
    reason: "node --test; the user runs it by hand",
  },
  {
    re: rule(
      String.raw`(?:tsc|eslint|vitest|jest|mocha|playwright|cypress)(?:\s|$)`,
    ),
    reason: "build, lint, or test command; the user runs it by hand",
  },
];

export function findHeavyCommand(command: string): Rule | undefined {
  return RULES.find((rule) => rule.re.test(command));
}

export default function noHeavyCommands(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return undefined;
    const command: string = event.input?.command ?? "";
    const violation = findHeavyCommand(command);
    if (!violation) return undefined;
    return {
      block: true,
      reason:
        `Blocked by no-heavy-commands: ${violation.reason}. ` +
        "Write the command out and ask the user to run it, then wait for " +
        "their output. Read-only shell (grep, cat, find, ls, git status, " +
        "git diff) is not blocked.",
    };
  });
}
