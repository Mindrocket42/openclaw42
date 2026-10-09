# Ironhead verification receipt — 2026-10-09

## Objective and scope

Create an isolated worktree from main; repair concrete security defaults; prepare
Ironhead inheritance; add bounded executable decomposition, intent correction,
and independently verified successful-method retention. Main baseline:
`a654e82dff5da2beb794f4abe35d41832d94e5d2`. Branch:
`worktree/ironhead-resolve-verify`. No live Gateway, machine state, credentials,
or existing user workspace was modified.

## Resolved

- Docker service ports publish on loopback unless explicitly opted into another
  host address; private .env permissions remain 0600.
- Checkout setup disables lifecycle side-effects cache and enforces supported
  package engines. Scripts remain an explicit operator opt-in.
- Native and dev bootstrap plus all role templates carry Ironhead's operational
  contract. Generated-template predecessor hashes preserve bootstrap classification.
  Explicit offline AGENTS migration preserves existing custom material.
- Registered `agents.juggle` composes the existing native collector owner, rejects
  aliased/overlapping declared resources, and admits collectors sequentially.
  It records the original request, reviews intent, corrects drift in at most two
  rounds, and diagnoses repeated methods with at most two extra reviews. Maximum
  17 collectors per invocation. No third failed identical method is admitted.
- Reviewer admission requires a configured native OpenClaw model and only the
  read tool. Code Mode, elevated execution, policy expansions, ACP, prepared target
  rewrites, and model changes are rejected. Policy is rechecked before effects.
  `session_status` was excluded because it can change models.
- Satisfaction requires a successful result for every lane and a compact saved
  procedure independently read back through the native read tool. False callback
  receipts, mismatched/truncated content, and failed retention cannot pass.
  Persistence retries once without repeating successful workers.
- Prepared restricted profile confines tools to isolated networkless sandboxes
  with QuickJS and explicit tool policy. It is not activated and contains model
  placeholders requiring normal configured model/auth setup.

## Executed proof

| Contract | Evidence | Result |
| --- | --- | --- |
| Registered Juggle controller | Actual full controller source, canonical test suite, synthetic native spawn/wait/read bridge | 12/12 passed; lead run 52 ms; independent review run 37 ms |
| Reviewer admission | Actual source helper with canonical config/model dependencies stubbed | 11 cases passed, including status-tool mutation rejection |
| Joined collector guard | Actual capability module with availability/schema adapters stubbed | 5 cases passed, including rewritten prepared targets, awaited revocation and expired authority |
| Docker setup | Actual offline setup entry point with existing Docker stub, fresh synthetic home/state | Loopback and explicit-address runs exited 0; .env0600; no pulls |
| Dependency setup | Actual setup entry point with package-manager stub, scripts opt-in0/1 | Correct engine/cache/lifecycle arguments; no profile mutation |
| Offline workspace migration | Synthetic AGENTS/custom files and byte checks | Dry-run, apply, backup, idempotence, preservation and refusal cases passed |
| Current-tree credential screen | 49,889 tracked text files; 460 skipped binary/large/symlink entries | Candidates only in test surfaces and documented profile IDs; no production credential identified by these patterns |
| Source integrity | Native TypeScript syntax parsing, Python syntax, JSON parsing, shell syntax, diff whitespace | Passed |
| Independent review | Source review plus independent controller execution | Actionable findings resolved |

## Material limits

The controller budget measures reported input/output tokens, excluding cache-read,
cache-write and provider charges. It stops new admission; it cannot stop a running
provider call. Resource claims coordinate this invocation; they are not global
filesystem locks. Changed method names still need semantic judgment.

Frozen dependency installation encountered registry tarball tunnel failures.
Full Vitest, typechecking, build, OpenGrep, advisory scanning and live
Gateway/provider/Docker execution remain unrun. Deterministic synthetic receipts
prove their stated control flow; they do not certify live isolation, model
interpretation, provider billing, or the user's machine configuration. The B:
drive was unavailable. The separate Juggle repository was empty at inspection.

## Confidence and completion boundary

High confidence in source changes and executed deterministic contracts, with
receipts above. Live system safety remains unverified. The deliverable is an
isolated implementation and reviewed configuration preparation; deployment,
main merge and an absolute no-leak/no-damage claim are not represented as done.
Successful method retention now has a mechanical receipt. On recurrence, role
instructions require reading that procedure and checking its applicability before
another run; they do not guarantee that an arbitrary model will always obey.
