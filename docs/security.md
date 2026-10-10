# Threat model

What the sandbox protects against, and what it does not. Read this before
trusting it with anything important.

## Protected

Reading secrets from the host home directory. `~/.ssh`, `~/.aws`,
`~/.gnupg`, `~/.kube`, `~/.docker`, `~/.config/gh`, and keyring
directories are not mounted.

Reading project secrets. `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`,
`id_ed25519` inside the project are replaced with `/dev/null`.
`.env.test`, `*.example`, `*.sample`, and `*.template` are exempt.

Host execution on project open. `.envrc`, `.husky`, `.githooks`,
`lefthook.yml`, `.pre-commit-config.yaml`, `.lintstagedrc`,
`.lintstagedrc.json`, `AGENTS.md`, `.pi`, `.nvim.lua`, `.exrc`, and
`.lazy.lua` are mounted read-only inside the sandbox, so an agent cannot
plant something the host will run later.

Commits on the user's behalf. `no-git-commit-push` blocks every
commit-producing git command.

Heavy commands. `no-heavy-commands` blocks tests, builds, installs,
migrations, container orchestration, and infrastructure tooling.

Escaping the project directory with edit or write. The path gate
normalizes to a project-relative path and rejects anything outside cwd.

Role markers from untrusted content. `permission-gate` ignores markers
found in assistant messages and tool results. Only user messages and
environment variables count.

## Not protected

Network egress. The sandbox has a private network namespace, but nothing
filters destinations. An injected agent can POST source code to any
public IP. `pasta --config-net` provides routing, not filtering. Add
host-level firewall rules or a filtering proxy if you need this.

Kernel exploits. `bwrap` uses the host kernel. A kernel vulnerability can
escape the sandbox.

seccomp. No syscall filtering. An agent can call any syscall the kernel
allows.

Memory exhaustion. `ulimit -v` limits virtual address space, not
resident memory. The process can still exhaust physical memory.

Cross-project session leakage. `~/.pi/agent/sessions/` is read-write and
shared across projects. An agent in project A can read history from a
session in project B. This is a privacy issue, not a boundary.

New files in `~/.pi/agent/`. The parent directory is read-write so pi can
write atomically with temp and rename. A new file is detected by the
post-run check, not blocked.

Bash in roles that have bash. `permission-gate` cannot inspect shell
commands. `no-git-commit-push` and `no-heavy-commands` do, but they are
regex-based. A determined bypass via `sh -c` with string concatenation, or
an absolute path from the nix store, is not caught.

`--tools` after a reload. If a role is loaded via slash command inside a
running pi, `--tools` is not reapplied. `permission-gate` is the only
barrier in that case.

The user. The user can disable the sandbox, run pi directly, or edit the
wrapper. This tool is for the user's own protection.

## Assumptions

The `ai-agent` wrapper is not modified between launch and use. The nix
store is trusted and read-only. The kernel is not compromised.

## Recommendations

If you need egress filtering, add `nftables` rules on the host or route
traffic through a proxy that allow-lists destinations. `pasta` supports
`--outbound-addr` but does not filter.

If you need a real boundary, use a VM (QEMU, Firecracker) or gVisor.
This project hardens the host, it does not isolate it.
