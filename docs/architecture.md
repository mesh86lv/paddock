# Architecture

## Layers

    host shell
      ai-agent wrapper (this project)
        pasta           private network namespace
          bwrap         mount, pid, user, ipc, cgroup namespaces
            pi          root session, role chosen at launch
              subagent  child pi process, role from PI_SUBAGENT_CHILD_AGENT

## Components

### modules/ai-agent.nix

A Home Manager module. It builds the `ai-agent` wrapper as a shell script
with `writeShellApplication` and installs it as a Home Manager package.
It also symlinks the extensions and prompts from this repository into
`~/.pi/agent/`, so the version in `~/.pi/agent/` is always the version
you committed.

### extensions/

Loaded by pi at session start. Each registers a `tool_call` handler that
can block the call and return a reason. They run inside the sandbox, in
the same process as pi.

`permission-gate.ts` resolves the active role and applies tool and path
rules. `no-git-commit-push.ts` blocks commits and destructive git
operations. `no-heavy-commands.ts` blocks tests, builds, linters, and
package managers. `prompt-registry-adapter.ts` rewrites the prompt files
into the format the subagent extension reads.

### prompts/

Role definitions. Each file has a YAML frontmatter block with `title`,
`model`, `description`, and `tools`, a `<!-- PI_ROLE: slug -->` marker,
and a markdown body. The body is appended to the system prompt. The slug
is what `permission-gate` uses to enforce the role's rules.

## Orchestrator flow

    user -> orchestrator (root pi)

             +-- subagent({ action: "list" })        role registry
             +-- ask_user("spawn X?")                user confirms
             +-- subagent({ action: "spawn", ... })  child pi starts
                   |
                   | child runs with:
                   |   --append-system-prompt <role body>
                   |   --tools <role tools>
                   |   env PI_SUBAGENT_CHILD=1
                   |       PI_SUBAGENT_CHILD_AGENT=<slug>
                   |       AI_AGENT_ROLE=orchestrator (inherited)
                   |
                   +-- decision boundary -> contact_supervisor
                   |     orchestrator receives [subagent_supervisor_request]
                   |     ask_user -> user replies
                   |     subagent_supervisor({ action: "reply" })
                   |     child resumes
                   |
                   +-- finished -> completion notification to orchestrator

## Role resolution

`permission-gate` resolves the active role in this order:

1. Child process (`PI_SUBAGENT_CHILD=1`). Use `PI_SUBAGENT_CHILD_AGENT`,
   which the parent sets at spawn time. This is the reliable path. Env
   vars are set by the parent process, not by anything the agent reads.

2. Root process. Parse `<!-- PI_ROLE: slug -->` from the most recent user
   message. Markers in assistant messages and tool results are ignored.
   Those can be forged by file contents.

3. Fallback. Read `AI_AGENT_ROLE` from the environment. `ai-agent.nix`
   sets this at launch when a role was picked from the fzf menu.

## Why a child process inherits the wrong role

When `@mickyyy68/pi-subagents` spawns a child, it inherits the parent's
environment, including `AI_AGENT_ROLE=orchestrator`. Without a special
case, `permission-gate` would see every child as the orchestrator and
lock it to read-only. `PI_SUBAGENT_CHILD_AGENT` exists precisely because
of this. Read it first, and read it before session history.
