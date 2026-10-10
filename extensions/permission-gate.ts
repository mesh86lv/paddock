// Role-based tool and path restrictions.
//
// Role resolution order:
//   1. If PI_SUBAGENT_CHILD is "1", the process is a child spawned by
//      @mickyyy68/pi-subagents. The role comes from PI_SUBAGENT_CHILD_AGENT,
//      which the parent sets at spawn time. AI_AGENT_ROLE is inherited from
//      the parent and cannot be trusted here.
//   2. Otherwise, parse the last <!-- PI_ROLE: slug --> marker from user
//      messages in the session history.
//   3. Fall back to AI_AGENT_ROLE, which ai-agent.nix sets at launch.
//
// Markers in assistant messages and tool results are ignored. Those can be
// forged by content the agent reads.
//
// Two levels of enforcement:
//   - ROLE_BLOCKED_TOOLS: tools that are forbidden entirely for the role.
//   - ROLE_ALLOWED_PATTERNS: for edit and write, the project-relative path
//     must match a regex. Paths outside cwd are rejected.
//
// Bash is not restricted here. For roles with bash, SCOPE_RE in ai-agent.nix
// runs a post-session check on changed files. Keep the two lists in sync.

import { relative, resolve, sep, isAbsolute } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ROLE_ENV = "AI_AGENT_ROLE";
const SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";
const SUBAGENT_CHILD_AGENT_ENV = "PI_SUBAGENT_CHILD_AGENT";

const ROLE_BLOCKED_TOOLS: Record<string, string[]> = {
  ask: ["edit", "write", "bash"],
  "code-reviewer": ["edit", "write", "bash"],
  "project-research": ["edit", "write", "bash"],
  "security-review": ["edit", "write", "bash"],
  architect: ["bash"],
  // The orchestrator coordinates but does not edit or run bash.
  orchestrator: ["edit", "write", "bash"],
};

const ROLE_ALLOWED_PATTERNS: Record<string, RegExp> = {
  architect: /^plans\/.+\.md$/i,
  "test-engineer":
    /(^|\/)(__tests__|__mocks__|tests?)\/|\.(test|spec)\.(ts|tsx|js|jsx)$|(^|\/)jest\.config\.(js|ts)$|(^|\/)conftest\.py$|(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)benches\//i,
  "documentation-writer":
    /(^|\/)docs?\/|\.(md|mdx|rst)$|(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE)[^/]*$/i,
};

const ROLE_MARKER_RE = /<!--\s*PI_ROLE:\s*([a-z0-9-]+)\s*-->/i;
const ROLE_SLUG_RE = /^[a-z0-9-]+$/;

type Entry = {
  type: string;
  message?: { role?: string; content?: unknown };
};

function roleFromHistory(entries: Entry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const content = entry.message.content;
    const text =
      typeof content === "string" ? content : JSON.stringify(content ?? "");
    const match = text.match(ROLE_MARKER_RE);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function roleFromEnv(env: NodeJS.ProcessEnv): string | null {
  const value = env[ROLE_ENV]?.trim().toLowerCase();
  return value && ROLE_SLUG_RE.test(value) ? value : null;
}

export function resolveRole(
  entries: Entry[],
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  // Child process spawned by @mickyyy68/pi-subagents: read the role from
  // PI_SUBAGENT_CHILD_AGENT. The parent's AI_AGENT_ROLE is inherited but
  // would resolve to "orchestrator" here, which would lock every child
  // down to read-only. Env is set by the parent, not by file contents, so
  // it is checked before history.
  if (env[SUBAGENT_CHILD_ENV] === "1") {
    const childRole = env[SUBAGENT_CHILD_AGENT_ENV]?.trim().toLowerCase();
    if (childRole && ROLE_SLUG_RE.test(childRole)) return childRole;
  }

  return roleFromHistory(entries) ?? roleFromEnv(env);
}

/** Project-relative POSIX path, or null if empty or outside cwd. */
export function toProjectRelativePath(raw: string, cwd: string): string | null {
  if (!raw) return null;
  const rel = relative(cwd, resolve(cwd, raw));
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    return null;
  }
  return rel.split(sep).join("/");
}

/** Returns a block reason, or null if the call is allowed. */
export function evaluate(
  role: string | null,
  toolName: string,
  rawPath: string,
  cwd: string,
): string | null {
  if (!role) return null;

  if (ROLE_BLOCKED_TOOLS[role]?.includes(toolName)) {
    return (
      `Blocked by permission-gate: role "${role}" has no access to tool ` +
      `"${toolName}". Restart ai-agent and pick a suitable role (for example code).`
    );
  }

  if (toolName !== "edit" && toolName !== "write") return null;

  const allowedPattern = ROLE_ALLOWED_PATTERNS[role];
  if (!allowedPattern) return null;

  const rel = toProjectRelativePath(rawPath, cwd);
  if (rel === null || !allowedPattern.test(rel)) {
    return (
      `Blocked by permission-gate: role "${role}" may only edit files ` +
      `matching ${allowedPattern}. Path "${rawPath}" does not match. ` +
      `Restart ai-agent and pick code for edits outside that scope.`
    );
  }
  return null;
}

export default function permissionGate(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    const role = resolveRole(ctx.sessionManager.getEntries() as Entry[]);
    const reason = evaluate(
      role,
      event.toolName,
      event.input?.path ?? "",
      process.cwd(),
    );
    return reason ? { block: true, reason } : undefined;
  });
}
