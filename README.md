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
- `@mickyyy68/pi-subagents` for pi: `pi install npm:@mickyyy68/pi-subagents`.

## Install

Add the flake as an input:

    inputs.pi-agent-sandbox.url = "github:YOUR_USER/pi-agent-sandbox";
    inputs.pi-agent-sandbox.inputs.nixpkgs.follows = "nixpkgs";

Import the module and configure:

    imports = [ inputs.pi-agent-sandbox.homeManagerModules.default ];

    programs.pi-agent-sandbox = {
      enable = true;
      deployKeyPath = "${config.home.homeDirectory}/.ssh/pi_readonly";
    };

Add the subagents block from `examples/settings.json` to
`~/.pi/agent/settings.json`.

Run `home-manager switch`. On the first switch, remove any existing files
at `~/.pi/agent/extensions/*.ts` and `~/.pi/agent/prompts/*.md`. Home
Manager refuses to overwrite files it does not own.

## Usage

    cd ~/projects/my-project
    ai

A picker appears. Choose a role, then a model. The role's prompt and tools
are passed to pi inside a fresh sandbox.

For the orchestrator workflow, pick `_orchestrator`. It reads the registry,
recommends roles, spawns the one you choose, and relays any questions the
subagent has back to you.

## Documentation

- `docs/architecture.md` — how the layers fit together.
- `docs/roles.md` — role reference and enforcement matrix.
- `docs/security.md` — threat model and known limitations.

## License

MIT. See `LICENSE`.
