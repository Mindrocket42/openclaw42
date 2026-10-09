# Ironhead Operating Model: Juggle and Intent Satisfaction

## Purpose

This fork treats agentic work as outcome management rather than a chain of model
calls. OpenClaw already owns spawning, collector durability, authority, tool
policy, and run lifecycle. Ironhead adds a coordination contract above that
substrate instead of creating a second swarm runtime.

## Control loop

1. Preserve the request and form an intent contract with outcome, constraints,
   acceptance evidence, and authority boundary.
2. Decompose independent lanes, execute, and validate their actual boundaries.
3. Classify hurdles and repair locally or through one bounded corrective lane.
4. Compare the observed result to the original intent. Repair a material gap;
   invoke the human only for irreducible authority or unavailable material input.
5. Present the satisfied result with receipts. Retain a successful recurring
   procedure and the diagnostic record of failed methods.


## Why this is not ordinary validation

Software validation usually asks whether an implementation conforms to a
specified interface, test, or invariant. Epistemic work has an additional
failure mode: the implementation can be internally valid while answering the
wrong question, optimizing a proxy, or handing the user an avoidable blocker.

The intent-satisfaction gate therefore compares the final state to the original
human request. It is deliberately downstream of implementation validation.

## Bounded decomposition

Ironhead defaults are intentionally conservative:

- collector swarm: 4 concurrent, 8 live children per group, 24 lifetime spawns;
- hard collector ceilings: 16 concurrent, 32 live, 128 lifetime;
- main agent default concurrency: 4 to 8 depending on available parallelism;
- configured main concurrency hard ceiling: 16;
- ordinary subagent default concurrency: 4;
- ordinary direct-child default: 4;
- default spawn depth: 1, making direct children leaves.

These limits are resource controls, not targets. Most work should use fewer
lanes. Parallelism is justified by independence, not by uncertainty.

## Ownership

The coordinator/Underboss is the sole integrator. Each lane has one state owner.
The Consigliere is an independent reviewer and hurdle diagnostician, not a second
executor. This prevents agent-agent loops, overlapping edits, and consensus
theatre.

## Dynamic hurdles

Unexpected conditions are normal runtime state. The coordinator first asks what
kind of hurdle exists and whether existing authority can resolve it. A human is
invoked only for an irreducible authority choice or material input unavailable
to the system. An agent can serve as oversight for evidence gaps and
cross-lane conflicts, but that oversight is itself bounded and cannot recursively
manufacture more supervisors.

## Learning from retries

Repeated similar attempts are treated as evidence of a defective procedure.
After two materially similar failures the method must change. If a later method
works and recurrence is likely, completion includes persisting the minimum
successful procedure in the nearest durable owner. This is the anti-Factory rule:
success without retained technique is incomplete learning.

## Security posture

The default repository setup no longer installs OS packages, invokes sudo, edits
login-shell profiles, or runs dependency lifecycle scripts implicitly.
Dependency scripts require explicit `OPENCLAW_TRUST_DEPENDENCY_SCRIPTS=1`.
Runtime execution policy, authority revalidation, sandbox rules, credential
handling, and OpenGrep remain the existing security owners.

## Executable intent loop

With Code Mode and swarm enabled, `agents.juggle` runs this loop through existing
spawn/wait owners. It accepts `request`, `acceptance`, one to four disjoint
`lanes` (id, owner, prompt, method, resources, optional agentId), `tokenBudget`,
`maxCorrections`, required `reviewerAgentId`, and an authorized `retain` callback.
The reviewer requires an explicit native model and a host-enforced `read`-only
tool policy, with Code Mode and elevated execution disabled. Default budget is
50,000 reported input/output tokens, excluding cached tokens and provider charges.
At most two correction rounds and two diagnostic review retries run, bounded to
17 collectors per invocation. Missing usage stops admission. The budget controls
subsequent admission; it cannot cap an in-flight provider call.

The result is `satisfied`, `blocked`, or `needs_human`, with evidence, review,
token accounting, and launches. Satisfaction requires the retained procedure's
verified artifact receipt. `retain(bytes, procedure)` writes the supplied compact
canonical JSON with an authorized file tool and returns its path. The controller
independently reads that path through the native file tool and compares its exact
content; a callback assertion proves nothing. No helper result
creates human authorization or weakens sandbox and tool controls.

## Workspace activation

New native workspaces load these packaged templates. Role creation uses its
role-specific AGENTS, SOUL, and IDENTITY. Native subagents inherit only AGENTS;
therefore operating authority and delegation rules live in every role AGENTS.
Existing workspaces remain untouched until explicit migration. Use the offline
migration procedure in [Role propagation](/reference/ironhead/ROLE_PROPAGATION).
Restart the serving runtime after replacing packaged templates so process-stable
template caches use the new package. Verify an actual child run receives its
workspace AGENTS; source inspection is not a live machine activation receipt.
