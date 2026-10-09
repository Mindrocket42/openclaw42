---
summary: "Ironhead role inheritance and explicit workspace migration"
title: "Ironhead role propagation"
---

# Ironhead Role Propagation

The operational contract belongs in AGENTS.md. SOUL and IDENTITY provide persona;
placing authority or outcome rules only in those files does not propagate them to
native subagents.

## Source receipts

Verified by source inspection, not a live deployment:

| Boundary | Authoritative source | Observed behavior |
| --- | --- | --- |
| Template discovery | `src/agents/workspace-templates.ts` | Package templates, source templates, then module-relative fallback |
| Native seeding | `src/agents/workspace.ts` | Loads AGENTS, SOUL, IDENTITY and USER; strips frontmatter |
| Existing file protection | `src/agents/workspace-bootstrap-publish.ts` | Exclusive creation preserves existing files and dangling symlinks |
| Native child context | `src/agents/workspace.ts`, `filterBootstrapFilesForSession` | Native subagents receive only AGENTS.md; private root memory is excluded |
| Role creation | `src/agents/agent-roles.ts`, `src/agents/agent-create.ts` | Loads role AGENTS, CLAW body as SOUL, and generated role IDENTITY; supplies those to normal seeding |
| Child workspace | `src/agents/subagents/spawn/subagent-spawn-child-plan.ts` | Same-agent child may inherit workspace; cross-agent child uses its target workspace |
| Development bootstrap | `src/cli/gateway-cli/dev.ts` | Uses separate dev templates and configured dev identity; not the native onboarding path |
| Stable template lifecycle | `src/agents/workspace.ts` | Process-stable template cache; package changes require runtime restart |

Default and all four role AGENTS now carry intent satisfaction, lane ownership,
authority limits, failure receipts, method changes, and retention requirements.
The coordinator is the sole integrator. A delegated coordinator-workspace child
remains a worker, not another human-facing coordinator. A reviewer may diagnose
and recommend correction; it cannot impersonate the human or mint approval.

Generic proactive monitoring, outbound contact, automatic commits/pushes, and the
renaming questionnaire have been removed as defaults. Development templates use
the same Ironhead operating contract. The predecessor generated AGENTS template hash is
retained so template changes do not misclassify untouched generated files as user
customization and silently complete onboarding.

## Explicit offline migration

Template changes do not retrofit existing workspaces. This is intentional data
protection, not a missing propagation mechanism. Prepare an isolated copy of the
workspace and stop processes using that copy. Run from the checked-out repository:

```bash
python docs/reference/ironhead/migrate-workspace.py /path/to/isolated-workspace
```

Dry run reports only the proposed operation and original/result hashes; it never
prints workspace contents. To apply to that offline copy:

```bash
python docs/reference/ironhead/migrate-workspace.py /path/to/isolated-workspace --apply
```

The helper merges a marked operating contract into existing AGENTS.md, preserves
all original bytes in a private backup, replaces the file atomically, and verifies
the resulting bytes. Repeated application is a no-op when current. Its marked
block replaces conflicting generic autonomy/retry/escalation defaults while
preserving custom identity and user directives. It does not touch SOUL, IDENTITY,
USER, memory, configuration, credentials, schedules, or installed software.
Symlink paths, absent files, malformed markers, and changed source bytes are
refused. Use a private workspace directory: file mode 0600 is not a Windows ACL.
Do not run the helper against an active workspace; offline isolation is required
for its final pathname replacement.

Migrate every configured target workspace whose agents may participate; migrating
only the coordinator does not change cross-agent role workspaces. Restart the
serving runtime after the upgraded package is installed. Inspect a real child
run's bootstrap receipt to confirm that the intended workspace AGENTS is present.
Do not claim live activation from source inspection or this helper's dry run.

## Verification performed

Temporary-directory execution verified dry-run immutability, explicit apply,
original backup, preserved custom AGENTS prefix, idempotence, preservation of
SOUL/IDENTITY/USER/credential files, symlink refusal, and malformed-marker refusal.
Byte checks covered CRLF, BOM, trailing whitespace, and no final newline; the
predecessor AGENTS hash matched the exact stripped pre-change source bytes.
`git diff --check` passed after the changes. The helper used synthetic files only;
no live workspace was changed.

Source receipts establish propagation paths with high confidence. A real gateway
run and the owner's focused runtime tests are separate deployment receipts; no
live machine, provider, or private B: drive was accessed by this lane.

Repository MDX/link checks were attempted but could not start because this checkout
has no installed repository dependencies. Focused native workspace tests require
the same dependency restore; this report does not label those checks as passed.
