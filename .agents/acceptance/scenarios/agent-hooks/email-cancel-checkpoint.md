# r29: Email wait cancellation boundary — observed failure

This round extends existing C07 without repeating r1/r27/r28 or adding a new plan ID. Fixed executed OSS is acceptance `f5ad98efc884e381699fc19cbab8ab61ed186ba7`, exactly Lc942's tree, with private Cloud69c38102 tsconfig/nested OSSf5ad. Original target remains e1f284d2 and contains no L identity/owner implementation. D Node24.21/Bun1.4.2, isolated existing dependencies, no install. No Next/browser or public Web stop was exercised; this is a real local programmatic execAgent/runtime and receiver round with explicit input/result-delay injection.

## Method and result

Each fresh owner-scoped agent uses real DB-created/access-checked shareGate and disclosed seeded calculator input. Only two beforeToolCall control endpoints are registered. A temporary driver wrapper calls the **actual** production-alias UserModel.getEmailsByIds and awaits its DB result, then holds that return for2.5seconds. It does not replace the DB data, HTTP transport, permission decision or production timeout. This models a delayed email lookup result, not a claim that PostgreSQL itself was slow.

The positive control confirms enrichment is optional: the production1second wait expires, both real control requests arrive without email, and the rewritten6*7 tool returns42. In the independent cancellation case, the driver invokes real `AgentRuntimeService.interruptOperation` when the held lookup begins. Acknowledgement is true at1790625770685. The receiver nevertheless records `/rewrite` at1790625771682 (+997ms) and `/check` at1790625771684 (+999ms). The durable tool content is42 with effective6*7, original7\*3 and additional context. Runtime and final operation reconcile tointerrupted. That terminal status does **not** establish no execution after cancellation.

C07's new email-wait case is **failed**. No filesystem/device/billing effect is claimed; the observed side effect is actual calculator execution plus its persisted result. The source's2second interrupt-sentinel polling versus1second optional-email wait is consistent with this timing. No precise regression attribution is claimed: coordinator and C2 received raw evidence to distinguish the existing polling window from the new lookup path. No D product fix or new review/checker was introduced. Old r1 delayed-control cancellation evidence retains its original delay, served SHA and narrower successful outcome.

## Probe integrity and owner boundary

The first two setup attempts wrapped a relative UserModel module that differs from the production Cloud alias. The gate never ran and those attempts errored after15seconds. Their records, logs and driver are preserved and explicitly excluded. Two new fixtures wrap the actual alias, with timeline entry `sameAsDriver:false` and a logged real DB return before the hold. Positive and cancel executions are independent, no old card or operation was reused.

A missing runtime owner was not synthesized: the valid user-scoped AiAgentService and AgentRuntimeService entry constructors require an owner, and that identity scopes the real persistence. Optional producer-context tests do not make an ownerless public/share entry reachable. Consequently missing-owner/no-fallback remains producer/source evidence, not a newly verified product route. The five r28 real email/owner/cache fixtures remain valid at their original SHA, but do not cover this failure or all16 events.

## Evidence and teardown

Raw root `.acceptances/hooks-d-email-cancel-r29/` contains plan, executed driver/receiver, observations, actual HTTP events, DB/Redis snapshots, per-fixture timelines, assertion of the observed failure, excluded setup manifest and private diagnostic logs. Only synthetic identities were used; private logs are excluded from publication. Positive control stops after one actual step (idle, no following provider run); no successful inference is claimed.

Only this round's QStash and receiver were started and stopped after cwd/PID verification. No listeners remain58080/58081/58096; D DB/Redis and all four fixture records are retained. No product code was modified, no old service/record was operated, no publication or final checker was attempted. The existing17 owner-arity test failures and upstream publication-order gap from r28 remain separate pending items.
