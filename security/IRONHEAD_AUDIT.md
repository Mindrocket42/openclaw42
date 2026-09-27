# Ironhead Security Audit

Date: 2026-09-27
Scope: `Mindrocket42/openclaw42` at baseline `37740084c3912ab308c44d399de6f3ac7e33ca99`

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

## Existing controls retained

The following were inspected and retained rather than duplicated:

- exec policy floors prevent model arguments from weakening configured deny /
  allowlist policy;
- privileged actions revalidate live authority at the execution boundary;
- collector spawning uses durable registry/idempotency and group limits;
- package postinstall pruning checks real paths, rejects symlink escape, limits
  filesystem scanning, and confines removal to package-owned dist content;
- Git hook preparation uses worktree-local configuration when no owner exists;
- the OpenGrep precise rulepack and CI workflows provide a regression firewall.

## Residual verification

**Not yet verified locally.** The user's local tunnel/PC connector was unavailable
during this pass, so B: drive variants could not be inspected and local
OpenGrep/build/test commands could not be executed on the checkout.

The branch should therefore be treated as **code-reviewed and structurally
hardened, pending executable CI/local proof**. A draft PR is the intended next
verification surface so repository CI can exercise the changed tests without
merging anything.

## Confidence

- Host-setup findings: **high, verified from source**.
- Agent/swarm resource findings: **high, verified from source and config owners**.
- Role-propagation finding: **high, verified from workspace bootstrap policy**.
- Claim that no other vulnerability exists: **not made**. This was a targeted
  security and orchestration audit, not a complete adversarial review of every
  first-party and bundled integration.
