# pi-agent-sandbox

A sandbox wrapper for the [pi coding agent](https://github.com/earendil-works/pi).
It runs pi inside a bubblewrap container with a private network namespace,
mounts the project read-only or read-write depending on the active role,
masks project secrets, and enforces per-role restrictions on tool calls.

I built this because giving an LLM free access to a laptop is not something
I want to do without a second layer between it and the filesystem. The
sandbox is not a security boundary. It is a way to make accidental damage
rare and to keep routine mistakes from becoming irreversible.

## What it does

Filesystem. The project is bind-mounted. Read-only if the role's tools do
not include edit, write, or bash; read-write otherwise. `~/.ssh`, `~/.aws`,
`~/.gnupg`, `~/.kube`, `~/.docker`, `~/.config/gh`, and keyrings are never
mounted. Files matching `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`,
`id_ed25519` inside the project are replaced with /dev/null. Examples and
test fixtures (`.env.test`, `*.example`) are exempt.

Network. `pasta` provides a private network namespace with NAT. Egress is
not filtered. An injected agent can reach any host. See `docs/security.md`.

Roles. Extensions run inside pi and block tool calls before they execute.

- `permission-gate` reads the active role and applies tool and path rules.
- `no-git-commit-push` blocks commit-producing and destructive git commands.
- `no-heavy-commands` blocks tests, builds, linters, installers, `npx`,
  docker, kubectl, terraform. The user runs those by hand.
- `prompt-registry-adapter` syncs `prompts/*.md` into the format the
  subagent extension expects.

Orchestrator. A meta-role that reads the role registry, recommends a role
for the task, spawns it as a subagent, and relays questions back to the
user through a supervisor channel.

## Requirements

- Nix with flakes enabled.
- Home Manager.
- pi (`npm i -g @earendil-works/pi`, or from nixpkgs).
- pi extensions:
  - `@mickyyy68/pi-subagents` -- provides the `subagent` tool and the
    supervisor channel used by the orchestrator role.
  - `pi-ask-user` -- provides the `ask_user` tool, also used by the
    orchestrator.

  Install both:

      pi install npm:@mickyyy68/pi-subagents
      pi install npm:pi-ask-user

## Install

Add the flake as an input:

    inputs.pi-agent-sandbox.url = "github:mesh86lv/pi-agent-sandbox";
    inputs.pi-agent-sandbox.inputs.nixpkgs.follows = "nixpkgs";

Import the module and configure:

    imports = [ inputs.pi-agent-sandbox.homeManagerModules.default ];

    programs.pi-agent-sandbox = {
      enable = true;

      # Optional. Mounted read-only inside the sandbox. If null, no key is
      # mounted and git-over-SSH will fail. git-over-HTTPS still works if
      # the sandbox has network access.
      deployKeyPath = "${config.home.homeDirectory}/.ssh/pi_readonly";

      # Optional. Adds the herdr binary to the sandbox PATH. If you do not
      # use herdr, omit this.
      herdrPackage = inputs.herdr.packages.${pkgs.stdenv.hostPlatform.system}.default;

      # Optional. Models offered in the fzf picker. Defaults are
      # deepseek/deepseek-v4-flash and deepseek/deepseek-v4-pro.
      modelChoices = [
        "deepseek/deepseek-v4-flash"
        "deepseek/deepseek-v4-pro"
      ];
    };

Add the subagents block from `examples/settings.json` to
`~/.pi/agent/settings.json`. That file must contain:

    {
      "subagents": {
        "disableBuiltins": true
      }
    }

`disableBuiltins: true` turns off the eight bundled agents that ship with
`@mickyyy68/pi-subagents`. Only the roles from this project will appear in
`subagent({ action: "list" })`.

Run `home-manager switch`. On the first switch, remove any existing files
at `~/.pi/agent/extensions/*.ts` and `~/.pi/agent/prompts/*.md`. Home
Manager refuses to overwrite files it does not own.

## Recommended settings.json tweaks

Two lines reduce startup noise. Both go in `~/.pi/agent/settings.json` on
the host (not inside the sandbox; that file is read-only there).

    {
      "quietStartup": "header",
      "builtinExtensions": { "mcp": false }
    }

`quietStartup: "header"` keeps the version line but hides the resource
listing (`[Skills]`, `[Prompts]`, `[Extensions]`). `builtinExtensions.mcp:
false` disables pi's built-in MCP support, which is redundant if you use
the `pi-mcp-adapter` extension.

## Usage

    cd ~/projects/my-project
    ai

A picker appears. Choose a role, then a model. The role's prompt and tools
are passed to pi inside a fresh sandbox.

For the orchestrator workflow, pick `_orchestrator`. It reads the registry,
recommends roles, spawns the one you choose, and relays any questions the
subagent has back to you.

### First launch is slow

The wrapper starts with an ephemeral `~/.pi/agent/npm` inside the sandbox,
unless you set `AI_AGENT_PERSIST_NPM=1` in the environment. On a cold start
pi installs its extensions with npm, which takes five to ten seconds and
prints nothing (npm output is silenced). Once you set `AI_AGENT_PERSIST_NPM=1`,
the install survives between sessions and subsequent launches are fast.

### settings.json is read-only inside the sandbox

The wrapper mounts `~/.pi/agent/settings.json` read-only. This is deliberate:
the agent should not be able to change its own permission model. You will
see one warning at startup:

    Warning: MCP: could not turn off Pi's built-in MCP: ... EROFS

It is harmless. `builtinExtensions.mcp: false` is already in effect; pi is
only failing to normalize the file. To edit settings, do it on the host,
outside the sandbox.

### Known warnings

Two extension warnings are expected and harmless:

    pi-hash-anchored-edit/package.json: typebox
    @mickyyy68/pi-subagents/package.json: @earendil-works/pi-tui, typebox

They mean those packages declared `typebox` (and `@earendil-works/pi-tui`)
in `dependencies` instead of `peerDependencies`. pi warns that it may load
two copies of a module. In practice nothing breaks. Fixing this requires a
change upstream in the packages; it is not a bug in this project.

## Parallel tasks

`ai-wt` creates a git worktree for one task and launches `ai-agent`
inside it, so several tasks can run at once without touching each other's
working tree:

    cd ~/projects/my-project
    ai-wt task-a

Open one herdr pane per task. Each run gets its own sandbox (pasta, netns,
bwrap, pi). The first call creates `.worktrees/<task-name>` on branch
`wt/<task-name>` and adds `.worktrees/` to `.gitignore`. When a task is
done, merge on the host (the agent cannot merge — `no-git-commit-push`
blocks `git merge` and `git worktree *`):

    git merge --no-ff wt/task-a
    git worktree remove .worktrees/task-a

git branch -d wt/task-a

See `docs/worktrees.md` for details and limitations.

## Documentation

- `docs/architecture.md`: how the layers fit together.
- `docs/roles.md`: role reference and enforcement matrix.
- `docs/security.md`: threat model and known limitations.
- `docs/worktrees.md`: parallel tasks with git worktrees.

## License

MIT. See `LICENSE`.
