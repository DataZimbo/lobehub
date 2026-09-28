# D integrated execution checkpoint — 2026-09-28

This is an in-progress handoff, not an acceptance verdict or published report.

## Source and isolation

- Integration base: `858b2d4586fcd2b0cfea8b3f8b8757019e152a29`, pushed as `feat/agent-hook-integration-base`.
- Fixed ancestors: C2 `5299fed7`, S `a67a39c6`, K `5e3a2f73`, L `b9fda258`, plus C1/H/F/T carried by C2.
- The only merge conflict was imports in `packages/agent-runtime/src/types/hooks.ts`; retained both `CompactHookContext` and `AgentRunLineage`. No functionality was repaired in the merge.
- D preparation material retained by docs merge `880be311a37d1fa88c55c9e2fccf6388d4ad12f6`. Product tree matches the integration base.
- Immutable evidence directory: `.acceptances/hooks-d-integrated-r1/`. Raw private logs and broad state snapshots must be pruned/redacted before publication. They are not automatically eligible evidence attachments.

## Observations already collected

| Boundary                     | Actual observation                                                                                                                                              | Limit                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Real local/queue `execAgent` | HTTP step/error/completion notifications correlate with actual missing-provider failure                                                                         | No successful model inference; queue uses the local QStash service                            |
| Tool control/device          | Actual HTTP allow/deny/protocol fixtures feed real runtime and D CLI device; positive marker writes and negative no-write controls recorded                     | Tool calls are explicitly seeded assistant fixtures, not model output                         |
| Approval                     | `allow` still parks an out-of-working-directory write; real Web Submit dispatches to the D device                                                               | Parent reply cannot complete without model credentials                                        |
| Rewrite card                 | Persisted tool arguments and before-intervention event contain B, but the rendered approval card and parent assistant tool payload show A                       | Reported to C2; do not count as passed or approve the stale card                              |
| Critical lifecycle           | Actual HTTP 503 for done/onComplete, error/onComplete, error/onError propagates the same critical error; original durable terminal state/error remains          | Done input is seeded; error inputs exercise actual missing-key failure                        |
| Reload isolation             | Same service runs A then B; injected state-read failure/reload failure preserves B origin and thrown error identity; no-first-load C does not borrow A/B origin | Targeted state-read fault injection disclosed; not an actual Redis outage                     |
| Compression                  | Real long-input runtime invokes compression; normal vs delayed critical HTTP 503 retain the same missing-key compression failure and continuation phase         | Successful compression and next-model input remain unverified                                 |
| Child launch                 | Real isolated child DB/thread/queue launch returns while child is running, later errors; nonexistent child produces actual creation failure                     | Shared-group, sustained successful child and worker-recovery variants remain open             |
| Registration                 | Actual `execAgent` returns `success:false`/error for eight invalid configurations                                                                               | Initial driver wrongly equated rejection with throwing; use `registration-validation-v2.json` |
| Worker recovery              | Worker A killed only after receiving its actual HTTP barrier, verified D cwd; worker B started against the same D Redis/DB                                      | Worker B received replay after natural lease expiry; no lock/store was deleted                |

## Quality and blockers

- D fixed dependency graph full type base/current: 1444 diagnostics, byte-identical. This is **not a type pass**. Duplicate Drizzle versions are a major cause; no C2 environment result is substituted.
- Initial integrated F-to-base check had three RuntimeExecutors fixture failures and twelve S HTTP-fixture failures. D subsequently adapted two test files to the integrated contract: the same 63-file check now has 1103 tests passed / lint clean. The original red log and corrected log are retained; these tests do not replace actual HTTP product evidence. See `execution-checkpoint.md`.
- D receiver changes pass scoped lint and harness self-check (14 response fixtures, 16 hook factories, disconnect/redaction).
- The available independent Cloud checkout `4b2a3272` with nested OSS `858b2d45` has its own D package/cache/store/state directories and cloud database. `/signin` fails compilation because its business-const overlay lacks `DEFAULT_ASR_MODEL`. No shared checkout was modified. Generic review/token paths remain blocked on a compatible Cloud overlay.
- Static Cloud `deliveryV2 -> defaultDeliveryV2 -> createBatchWithSupersession` forwards the whole `supersedes` object. This is not runtime proof.
- Real model credentials and managed QStash access remain unavailable. The coordinator owns the outstanding provider-location question.
- The same acceptance-checker has one final evidence review remaining. No final acceptance URL or passing report has been published.
