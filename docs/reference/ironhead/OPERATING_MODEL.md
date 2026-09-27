# Ironhead Operating Model: Juggle and Intent Satisfaction

## Purpose

This fork treats agentic work as outcome management rather than a chain of model
calls. OpenClaw already owns spawning, collector durability, authority, tool
policy, and run lifecycle. Ironhead adds a coordination contract above that
substrate instead of creating a second swarm runtime.

## Control loop

```text
REQUEST
  -> INTENT CONTRACT
  -> DECOMPOSE (only independent lanes)
  -> EXECUTE + LOCAL VALIDATION
  -> HURDLE? --yes--> CLASSIFY -> REPAIR / CORRECTIVE LANE -> EXECUTE
  -> INTENT-SATISFACTION GATE
       | no, repairable -> smallest corrective lane
       | no, irreducible -> human decision/material input
       | yes
  -> PRESENT RESULT + RECEIPTS
  -> RETAIN METHOD when recurrence is likely
```

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
