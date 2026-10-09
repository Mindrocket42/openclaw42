# Juggle implementation and verification

## Objective and owner

Turn decomposition, intent review, bounded hurdle correction, and retention into
an executable flow using the existing collector runtime. The existing registry
continues to own admission, execution identity, durable queued launches,
completion, restart reconciliation, and cleanup. No second scheduler or runtime
state store was added.

## Findings and decision

Source verified: collector completion already provides structured results and
input/output token usage; Code Mode already delegates through policy-controlled
`agentSpawn` and `agentWait`. Neither `sessions_spawn` nor `agents.run` exposes a
provider token ceiling. Previously `agents.run` required callers to invent the
intent/correction loop themselves.

`agents.juggle` is now registered beside `agents.run` in the existing Code Mode
controller. It composes that same host bridge. Its contract is:

- Original request and acceptance are captured before the first await and carried
  into every worker/reviewer prompt.
- One to four lanes each declare an ID, owner, method, assigned prompt, and resource
  list. Duplicate lane IDs and equal/ancestor resource claims, including within one lane, fail before spawn.
- Juggle admits one collector at a time. This prevents simultaneous writers in
  this composition and limits token overshoot to one running collector. Existing
  `agents.run` parallelism and the host scheduler remain available.
- Every worker and reviewer contributes reported input plus output tokens to one
  budget. Cache-read/cache-write token fields and provider charges are excluded;
  this value is not total billed usage. Missing/invalid usage prevents subsequent admission. Budget exhaustion
  prevents new workers and reviewers; it cannot preempt an admitted provider call.
- One explicitly configured, host-restricted read-only collector reviews the original intent against observed results.
  Successful internal validation alone does not establish satisfaction.
- A reviewer can propose corrections for existing lanes and methods. It cannot
  grant authority. At most two correction rounds run: at most 17 collectors with
  four lanes, including up to two diagnostic reviewer retries. Two failures of the same lane method require changing that method;
  the reviewer gets up to two bounded diagnostic retries to propose a changed method.
  If these fail, the controller returns `method_change_required` without a third same-method worker attempt.
- Human escalation requires a classified missing authority decision or unavailable
  material input. Other terminal reasons remain controller facts for the
  coordinator to diagnose; they are not requests for human approval.
- Satisfaction requires the latest result of every lane to be successful and
  nonempty, followed by an awaited procedure-retention callback. That callback
  writes immutable canonical bytes to a named artifact through existing policy-controlled tools
  and returns its path. The controller independently invokes the native `read`
  tool and requires `{kind: "text", content: <exact bytes>}`. Callback claims,
  mismatches, unavailable reads, and truncated reads cannot establish success. Retention retries once without
  rerunning successful workers. A missing/unverified receipt prohibits success.

Resource claims are caller-declared coordination boundaries, not an OS sandbox
or cross-session lock. Semantically equivalent method names require coordinator
judgment; exact method IDs are enforced mechanically. Usage is observed collector
telemetry, not a hard provider-spend ceiling. The retention callback owns the
artifact write and must be idempotent because the bounded retry can follow
an uncertain write outcome. VM continuation/replay and registry ownership remain
unchanged; arbitrary callback code does not gain filesystem authority.

## Usage

Enable Code Mode and swarm, then call `agents.juggle` from the existing Code Mode
JavaScript tool. Supply `request`, `acceptance`, required `reviewerAgentId`, `lanes`, and `retain`; optionally
supply `tokenBudget` (default 50000, ceiling 500000), `maxCorrections` (default and
ceiling 2). Lanes may supply an `agentId`.

The `retain(bytes, procedure)` callback receives immutable canonical JSON bytes
and their parsed method record. Write those exact bytes through an existing native
file tool and return the path; the controller owns independent verification. The
compact artifact preserves the original request, acceptance, lane method and
assigned prompt, durable run/session references, and bounded result summaries.
Raw completion evidence remains in the returned result and existing transcripts.
UTF-8 content is capped at 32 KiB, below the native reader's 50 KiB truncation
ceiling. A larger original request/method record returns `procedure_size_limit` for
the coordinator to resolve. Do not substitute `results.save`, a console message,
or a promise of later saving for durable procedure retention.

The result status is `satisfied`, `blocked`, or `needs_human`; it contains evidence,
review, aggregate tokens, and launches. Blocked results include a specific reason.
A satisfied result also carries the verified procedure receipt. All `blocked`
results are coordinator outcomes, not human gates. Diagnose them with the recorded
evidence; do not rerun completed workers merely to repair persistence or adjust
a policy/budget. Only `needs_human` identifies an authority/material-input choice.

## Verification receipt

The canonical regression suite is `src/agents/code-mode-juggle.test.ts`. The suite
executes the actual full Code Mode controller source in a Node VM and serves
synthetic collector completions through its registered host bridge. It does not
reimplement Juggle or call an unregistered helper directly.

Native Node execution on 2026-10-09 passed twelve tests in approximately 40 ms:
original-intent correction and retention; overlap rejection before spawn;
budget/missing-usage admission halt; two-failure method halt; autonomous
method-change diagnosis; bounded retention repair; cancellation propagation; rejection of forged/unverified/truncated retention;
UTF-8 artifact bounds; canonical resource alias rejection; classified human escalation. This is verified deterministic control-flow evidence. Live model interpretation,
provider billing ceilings, and actual artifact persistence remain outside this
synthetic receipt. Full Vitest/type/build checks require repository dependencies;
the environment's registry tunnel denied dependency downloads.
