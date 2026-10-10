# Security policy

## Scope

This is a defense-in-depth helper, not a security boundary. It assumes
the agent it wraps can be prompt-injected by anything it reads: file
contents, PR descriptions, commit messages, MCP responses, HTTP responses,
command output. The goal is to reduce the damage an injected agent can do,
not to make injection impossible.

## Known limitations

Full list in `docs/security.md`. Short version:

- Network egress is not filtered. An injected agent can exfiltrate to any
  host reachable from the sandbox.
- No seccomp profile. Syscalls are unrestricted.
- `ulimit -v` limits virtual address space, not resident memory.
- The sandbox shares the host kernel. It is not a VM, not gVisor, not
  Kata Containers.
- `~/.pi/agent/sessions/` is read-write and shared across projects. An
  agent in project A can read the history of a session in project B.
- Path enforcement uses regex. It catches common cases, not creative ones.

If you need a real boundary, run pi inside a VM or gVisor.

## Reporting a vulnerability

Open a private security advisory on this repository. Do not open a public
issue for a security problem.

Include a description, reproduction steps, which layer is affected
(sandbox, extension, or prompt), and whether the issue requires a
compromised model, a compromised dependency, or something else.

This is a hobby project. Expect a response within a week, not an SLA.
