# r28: Trusted owner and email delivery checkpoint

Original-stack target is `e1f284d2593a05103665c419fd80bb3c659b4cba`, a conflict-free merge of previous647 and fixed C2bb74. Its tree973cea3b6ab76bd7420001ee614062ab28234695 equals L's projected target. Docs inherited that target at a4db051e. L's identity/owner implementation is kept out of this target and the docs product diff. The separate `feat/agent-hook-trigger-user-acceptance` composition is `f5ad98efc884e381699fc19cbab8ab61ed186ba7`, with the exact complete tree of fixed L `c9426d7432b983d26e70041f2c54ef7728bade93` (a1b19c51f49f889c0859ab1da51ab7f157374b78). F XOR is absent; local/queue remains supported.

## Observed execution

Private Cloud69c38102+nested OSSf5ad served Next39927 with the existing D Postgres/Redis, local QStash58080/58081 and receiver58096. Node24.21.0/Bun1.4.2; no installation. Workspace package realpaths point to D's current source or the private Cloud nested source, not root canary. The Node worker PID remained74379 across the queue warm-cache sequence. A real DB-created link share is access-checked by AgentShareModel, then passed to actual programmatic execAgent. Principal is constructed by production code. This is not authenticated public shareChat HTTP/UI; that router does not accept hooks. Tool calls use disclosed seeded llm\_result; calculator execution is real, subsequent provider inference fails.

Five independent fixtures: local owner, local visitor, queue owner, queue visitor, then a second owner with the same visitor. They yielded210 receiver requests, including40 actually signed local-QStash callbacks. Six types were emitted: beforeStep, beforeToolCall, afterToolCall, afterStep, onComplete, onError.

- External payload userId/email matched the event's owner or trusted visitor. All persisted operation/topic/message/tool ownership and queue metadata/state origin remained runtime owner. Visitor topic sender/stream identity remained separate.
- Static callback body selected the runtime owner and arrived through real local QStash with that owner's DB email. Supplied forged userEmail was discarded. A foreign userId did not disclose email; neither did a projection excluding userEmail. A projection including email but omitting userId used the event initiator for lookup, without inventing a userId field.
- The same Next worker first delivered owner A's email, then processed owner B's visitor run whose forged body selected A. Those later requests had no email despite a warm per-dispatcher cache. This proves the observed cross-owner HTTP boundary, not every cache/race/TTL path.
- First control saw original7*3; second saw effective6*7 while original remained7*3. Both carried the trusted event email. Calculator returned42. Durable tool arguments and hookPreparation retained effective6*7, original7\*3 and the additional context. Ordinary notifications omitted originalArgs.
- Visitor remained headless with no device grant. No permission was relaxed, and no human/subagent visitor route was fabricated.

The four r28 plan outcomes are bounded observations, not final-checker verdicts. `assert-results.py` passed for all five fixtures. This is actual HTTP payload/ownership evidence, not a claim that a downstream bot callback consumer ran or that shared UI/remaining ten producer types/all16 were verified. Missing-email/lookup failure/cancel timing, other producer routes, new-identity reapproval/continuation recovery, successful parent/model output and managed QStash remain unverified in this round. Existing r7/r17/r23/r27 evidence retains its own source and scope.

## Quality and outstanding owner fixtures

Both old647 baseline and new target e1 were freshly checked in D's fixed dependency environment. Target18 paths:357 tests and lint passed; full type failed1444. Acceptance26 paths:lint clean, but17 test assertions failed across AgentRuntimeService.test.ts (5) and CompletionLifecycle.test.ts (12), where the expected four-argument dispatch calls omit the new fifth trusted-owner context. Full logs were sent to L; D made no fixture or product patch. Do not substitute L's452 tests for this failed broader check.

All three type runs count1444 and have the same diagnostic file/code multiset. Raw or line-normalized complete logs are not equal: two existing oidc-provider adapter SQL union renderings choose a different table as the displayed first union member. The source file is unchanged; these results are recorded exactly, without claiming byte equality or full type success. No dependency/configuration/type suppression was introduced. The temporary driver/receiver lint passed with formatting autofixes; executed script copies are preserved.

## Artifacts, publication and teardown

Raw immutable execution is under `.acceptances/hooks-d-owner-email-r28/`: plan.json, report.md, and assets containing source-versions/workspace-resolution, actual events.jsonl, observations.json, DB/Redis snapshots, worker HTTP records, executed scripts, quality-summary, target/identity logs and comparisons. Private logs are not publication artifacts. No browser was started; only owned Next/QStash/receiver process trees were stopped, with no remaining39927/58080/58081/58096 listener. Existing DB/Redis and all synthetic evidence rows remain.

A normal remote read succeeded: Lc942 is published, but C2 stillf3/base7c1 and C1still0244. Accordingly D did not bypass the agreed T→C1→C2→D publication order. e1/docs remain local until upstream publication is confirmed; L has the exact local target for net-diff preparation. No new code review or final acceptance checker, no passing URL, no promotion of the original31 ledger.
