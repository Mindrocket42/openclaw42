# Ironhead Security Audit

Updated: 2026-10-09
Current worktree base: `a654e82dff5da2beb794f4abe35d41832d94e5d2` (from `origin/main`).
Historical source review: 2026-09-27 at `37740084c3912ab308c44d399de6f3ac7e33ca99`.
Scope: setup, Docker publishing and mounts, ambient egress, agent resource defaults, workspace role propagation, and orchestration controls.

## Executive result

The repository already contains substantial execution-authority, sandbox,
credential, approval, and static-analysis controls. The material fork-specific
risks found in this pass were not a total absence of security; they were unsafe
**operational defaults**: machine-mutating setup behavior and excessively broad
agent fan-out.

This branch changes those defaults and propagates the Ironhead operating contract
through the bootstrap surface actually inherited by subagents.

## Findings and disposition

### IH-01 - Setup mutated host state by default - REMEDIATED

**Verified.** `.agents/setup` installed OS packages through apt/sudo, provisioned
a Node toolchain under the user's home directory, enabled dependency lifecycle
scripts, and appended repository PATH logic to `~/.bash_profile`.

**Risk.** A convenience setup path could alter the host outside the checkout and
execute transitive package lifecycle code before the operator had reviewed it.

**Change.** Setup now requires host prerequisites, performs no sudo or OS package
installation, makes no shell-profile changes, and installs dependencies with
lifecycle scripts disabled. Lifecycle scripts are an explicit opt-in through
`OPENCLAW_TRUST_DEPENDENCY_SCRIPTS=1`.

### IH-02 - Swarm fan-out was operationally excessive - REMEDIATED

**Verified.** Collector defaults were 32 concurrent, 50 live children, and 200
lifetime children per group. Configured hard clamps allowed far larger values.

**Risk.** A bad decomposition or retry loop could consume large model and machine
resources while still remaining "within policy".

**Change.** Defaults are 4 concurrent / 8 live / 24 lifetime; hard ceilings are
16 / 32 / 128. Wait ceilings are reduced from 24 hours to 1 hour, with a 5-minute
default.

### IH-03 - General agent concurrency scaled aggressively with CPU count - REMEDIATED

**Verified.** The top-level default used four agent runs per available CPU with a
minimum of eight; ordinary subagent depth defaulted to five.

**Risk.** High-core hosts magnified orchestration mistakes, while recursive
delegation could multiply work outside the collector-group budget.

**Change.** Default top-level concurrency is now bounded to 4..8, explicit config
to 16, ordinary subagents default to 4 concurrent/direct children, and default
spawn depth is 1.

### IH-04 - SOUL-only role propagation would not control subagents - REMEDIATED

**Verified.** Workspace provisioning supports SOUL/IDENTITY, but the subagent
bootstrap allowlist carries `AGENTS.md` only.

**Risk.** Branding the main agent as Ironhead without putting operating doctrine
in AGENTS would leave delegated workers on generic behavior.

**Change.** Ironhead's outcome ownership, epistemic receipts, bounded Juggle
rules, intent-satisfaction gate, dynamic hurdle loop, and procedure-retention
rule are now in the default AGENTS template. SOUL/IDENTITY carry persona and
identity, while coordinator/reviewer roles become Underboss/Consigliere without
changing their stable role ids.

### IH-05 - Ambient discovery and update egress was default-on - REMEDIATED

**Verified.** Upstream defaults performed a daily update request, refreshed the
hosted model catalog, could advertise mDNS on macOS, scanned installed apps
during guided setup, and enabled headless node auto-update unless disabled.

**Risk.** These behaviors disclose machine/platform or local-inventory metadata
or initiate outbound traffic without an Ironhead operator explicitly requesting
that network/discovery behavior.

**Change.** Automatic update checks, node auto-update, hosted model-catalog
refresh, mDNS advertising, and installed-app recommendation scanning now require
explicit opt-in. Provider/channel traffic explicitly configured by the operator
is unchanged.

### IH-06 - Docker published all service ports to every host interface - REMEDIATED

**Verified from source.** Compose short port syntax omitted a host address for
Gateway (18789), bridge (18790), and Teams webhooks (3978).

**Change.** Every published port now defaults to `127.0.0.1`. An operator can
explicitly set `OPENCLAW_PUBLISH_HOST` to a LAN/tailnet IP or `0.0.0.0`.
Setup persists the value to `.env` and explains the actual published address.
The container listener remains `lan`; changing it to loopback would break
Docker port forwarding and container peers. Remote webhooks and direct tailnet
access require an explicit reachable publishing address or reverse proxy.

**Executable receipt.** On 2026-10-09, the actual `scripts/docker/setup.sh
--offline` was run twice against the existing test helper's Docker stub in a
fresh temporary checkout/home/state: default `127.0.0.1` and explicit
`192.0.2.5`. Both exited 0, persisted the expected publishing address, retained
`.env` mode 0600, printed the address, and made no Docker pull calls. This proves
setup behavior without touching a real daemon. Compose port declarations were
source-reviewed; actual host socket bindings are not yet observed. Existing
`test/scripts/docker-setup.test.ts` assertions now cover all three mappings.

### IH-07 - Safe dependency setup allowed cached lifecycle outputs and unsupported engines - REMEDIATED

**Verified from source.** `.agents/setup` disabled lifecycle execution but
explicitly enabled pnpm's side-effects cache and disabled strict engines.
Cached build outputs can outlive the lifecycle trust decision; the broad Node
major check also does not enforce the package's complete supported version range.

**Change.** Dependency installation disables the side-effects cache and enables
strict engines. `package.json` remains the authoritative supported runtime
contract. Dependency lifecycle execution still requires the existing explicit
`OPENCLAW_TRUST_DEPENDENCY_SCRIPTS=1` opt-in.

**Executable receipt.** The actual `.agents/setup` entry point was run with a
stub package manager at opt-in values 0 and 1. Both exited 0, invoked install
with `engine-strict=true` and `side-effects-cache=false`, selected the expected
lifecycle mode, and made no shell-profile file. This proves install arguments
and setup control flow, not pnpm's dependency graph or supply-chain integrity.
`bash -n .agents/setup scripts/docker/setup.sh` and `git diff --check` passed.

## Existing controls retained

### Current-tree credential pattern screen

On 2026-10-09 a redacted path/line-only pattern screen examined 49,889 tracked
text files; 460 binary, large, or symlink entries were skipped. It screened
GitHub/provider token forms, AWS access IDs, and PEM private-key delimiters.
All matches were in test/fixture surfaces except two documented managed GitHub
profile IDs, which are identifiers rather than credentials. No production key
was identified by this screen. This is a current-tree pattern screen, not a
history/entropy scan or credential validity check. Existing redaction fixtures
were retained. Detailed path-only receipt: task working record.

### Prepared restricted configuration

`docs/reference/ironhead/restricted-config.json` prepares all-session isolated
Docker tools with no sandbox network, explicit tool allowlists, disabled elevated
execution, QuickJS Code Mode, loop detection, and a native read-only
reviewer. It contains model placeholders and no credentials; it is not silently
applied to a running machine. JSON syntax and schema field ownership were
source-verified. Live effective configuration and isolation remain unverified.

The following were inspected and retained rather than duplicated:

- exec policy floors prevent model arguments from weakening configured deny /
  allowlist policy;
- privileged actions revalidate live authority at the execution boundary;
- collector spawning uses durable registry/idempotency and group limits;
- package postinstall pruning checks real paths, rejects symlink escape, limits
  filesystem scanning, and confines removal to package-owned dist content;
- Git hook preparation uses worktree-local configuration when no owner exists;
- the OpenGrep precise rulepack and CI workflows provide a regression firewall.

## Residual exposure and verification

- The default Docker service mounts host state, workspace, and auth secret
  directories writable. Host files in these mounts remain within the agent's
  destructive reach. Containerization does not protect those files; backups,
  least-privilege tools, and a read-only or isolated workspace are still needed.
- `OPENCLAW_SANDBOX=1` intentionally mounts the Docker socket into the Gateway.
  Access to a privileged Docker daemon can grant host control through new
  containers and mounts. This path is explicit opt-in, not a security boundary
  against a compromised Gateway. A dedicated daemon/VM or socketless sandbox
  backend is needed for that threat model.
- Provider, channel, plugin, and model traffic remains enabled when configured.
  Network metadata defaults were reduced; no OS/network egress allowlist has
  been established. Prompt instructions cannot guarantee prevention of data
  exfiltration.
- The normal install scripts still support requested OS/toolchain setup and
  global package installation. They were source-inspected and not executed.
  The hardened checkout setup is `.agents/setup`; it is not a promise that all
  installation commands are free of host changes.
- Dependencies were absent when this security lane ran. Package-manager
  stub proofs above passed; Vitest, full build, OpenGrep, dependency advisory
  scanning, live Docker, and adversarial provider/plugin tests remain unrun in
  this lane. They are not silently represented as passing.
- No credentials, live state, Docker daemon, or B: drive were accessed. The B:
  variants and the user's existing machine configuration remain unavailable.

The changes reduce concrete defaults and preserve deliberate opt-in capability.
They do not establish that every integration is vulnerability-free or that a
host with unrestricted tool authority cannot be damaged.

## Confidence

- Host-setup findings: **high, verified from source**.
- Agent/swarm resource findings: **high, verified from source and config owners**.
- Role-propagation finding: **high, verified from workspace bootstrap policy**.
- Claim that no other vulnerability exists: **not made**. This was a targeted
  security and orchestration audit, not a complete adversarial review of every
  first-party and bundled integration.
