# Cloud source Stop retry repair — r17

Private Cloud `69c38102cf1af86917737a96aa02829c1e2eadb4` served nested OSS integration `196787eedd3578c895dc68c6af181bb16dedc842`, containing C2 `398d8a6492777c9cdd498029d245dddc54d8ee44`. D docs at execution were `829dbbe3496fd8204625a38a8c7f707222fa499c`. Both integration and docs merges were conflict-free; S767/K5e3/Lb9/H1c2/C17a6 remain ancestors. D made no product or owner-test repairs.

This affected-path run supplements the failed r14 source-router observation. It does not replace r14 history, claim a new independent review, or declare complete acceptance.

## Real entry and observed sequence

Each new fixture uses actual `execAgent({hooks})`, an explicitly seeded assistant/llm\_result, real runtime HTTP rewrite to B, and the actual Cloud provider's durable Review creation. No Review row or resolution is fabricated. The authenticated synthetic account reads and resolves that Review through `aiAgent.getAgentInterventionReviewBySource` / `resolveAgentInterventionBySource`. These are browser HTTP calls, not token-link or pending-card clicks.

Critical source operation: `op_1790610200744_agt_RAcAkgNV4K76_tpc_kRwIgOiUQEY6_uuTMWYjM`. All four requests keep resolution request `cf67602c-8361-4258-856b-5277f6e562b5`.

| Endpoint response   | Actual API outcome               | Durable resolution / marker | Cumulative critical HTTP receipts |
| ------------------- | -------------------------------- | --------------------------- | --------------------------------- |
| First 503           | HTTP500, critical-delivery error | resolving / retained        | 1                                 |
| Same-request 503    | HTTP500, critical-delivery error | resolving / retained        | 2                                 |
| Same-request 200    | HTTP200, stopped, success        | completed / consumed        | 3                                 |
| Same-request replay | HTTP200, already\_resolved       | completed / absent          | 3                                 |

Every snapshot has one operation, three messages, interrupted business status and no B/C file. The successful and replay snapshots are equal. No continuation or tool execution was started. Normal observation endpoints preceding the critical endpoint can repeat across failed direct dispatches; this is not endpoint-level exactly-once delivery.

A separate new ordinary/best-effort fixture receives an actual 503, returns success, consumes the marker and completes the resolution. Replay does not send again; its selected database/receiver snapshot is unchanged. The old r14 incorrectly completed resolution was not touched or reopened.

## UI and limits

After cold reload, the critical fixture's real tool detail says “You canceled this Skill call.” The same screenshot still shows incorrect `Edited policy/B.txt` and green `+1` although no file exists. This pre-existing UI failure remains visible and non-pass. Immediate failure feedback from clicking the pending card was not exercised. The connected-device label is cached UI, not device execution evidence; no gateway/device process was started.

The source API's formerly false-success retry sequence is now observed working on this version. Review-token entry, custom cancellation, partial/mixed approval, token revision/concurrency and full card interactions are not proved by this run. Owner router tests cover some of those paths, but do not replace product evidence. Successful inference/parent reply and managed QStash still lack external configuration. The local QStash process is infrastructure only; the reserved worker port 39928 was not started.

## Quality and provenance

Five explicit paths: 157 tests passed and lint clean. D's same-environment full type checks on previous integration `5b762f884d` and current code are **1444 / 1449**, both failed. Ignoring shifted source line numbers leaves five added diagnostics, all in the new `aiAgent.heteroIntervention.test.ts` database assertions (789:62, 900:18/21, 906:18/21), involving the existing Drizzle 0.45.2/0.45.3 type split. Reported to C2; no dependency install, suppression or D test workaround. This is not “no new diagnostics” and does not inherit C2's type pass.

The first setup driver omitted `--tsconfig-override ./tsconfig.json`, created an OSS pending tool without durable Cloud Review, and is explicitly excluded. Its separate record was interrupted through the real API during cleanup. An ordinary setup launch while the root was temporarily at the type baseline failed before fixture creation because the docs harness was absent; it was rerun after restoring docs. These setup logs are retained. Actual accepted fixtures explicitly resolve the Cloud aliases and show durable Review rows.

Evidence root: `.acceptances/hooks-d-cloud-stop-route-r17/assets/`.

- `ancestry.json`, `provenance.json`: exact fixed inputs, Cloud/nested OSS, driver and scope.
- `critical-request.json`, `api-critical-{review,first503,second503,third200,replay}.json`: real read/action responses, one request identity.
- `db-critical-{before,first503,second503,third200,replay}.json`, `critical-receiver.jsonl`, `fresh-receiver.jsonl`: durable and actual HTTP observations.
- `ordinary-request.json`, `api-ordinary-*.json`, `db-ordinary-*.json`: ordinary 503/replay comparison.
- `critical-after-reload.png`, `critical-after-expanded-settled.png`: inspected collapsed/cancelled detail and still-incorrect Edited display. The intermediate expanded screenshot was loading and is not the final UI evidence.
- `result.json`, `check.log`, `types-base.log`, `type-comparison.json`: assertions and separate quality results.
- `setup-oss-alias-*`, `ordinary-driver.private.log`, `setup-cleanup-interrupt.json`: excluded setup attempts and cleanup.
- `teardown-processes.json`, `teardown.json`: browser closed and only verified D-owned services stopped; DB/Redis retained.

Private logs/full runtime fixture files require redaction before any publication. No final acceptance checker was used; the independent code-review allocation was already exhausted. PR remains draft.
