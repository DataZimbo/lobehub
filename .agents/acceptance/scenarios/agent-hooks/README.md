# D: Hook integration and acceptance work in progress

Cloud-dependent blocked subcases and the minimal real entry are listed in [cloud-blocked-subcases.md](cloud-blocked-subcases.md). OSS evidence is retained separately; no generic token/UI pass is inferred from the compatibility fallback.

Current status: preparation is complete and bounded product observations are recorded; the full 31-item acceptance is not complete. D draft PR #20137 targets its own integration-base, currently `81591e7112181cf29d0564af726ed6946a4acee1` (C2 507b37f9, fixed C1, S/K/L). See [integration-progress.md](integration-progress.md) and the execution/notification/Stop checkpoints for exact historical execution SHAs and remaining gaps. The initial phase-1 instructions below describe preparation provenance; they do not describe the currently integrated controls as unsupported. No final published acceptance or ready status is claimed.

Latest owner reconciliation: [owner-regression-checkpoint.md](owner-regression-checkpoint.md), 1267 tests/lint passed; full types 1444/1444, identical diagnostics and still failed.

Latest product supplement: [cold-card-checkpoint.md](cold-card-checkpoint.md). Cold B and fresh B→C reapproval/device execution were observed; an expired-source recovery path lost hooks and remains a reported failure.

## Files and finishing criteria

- `plan.json`: 31 stable user-outcome criteria, using Acceptance's existing `plan[]` schema. No test/lint/type gate masquerades as acceptance.
- `mapping.md`: requirement mapping, fixtures, observations, and evidence rules.
- `approval-repark.md`: partial-batch reapproval, pending siblings and stale/concurrent card actions; exact C2 binding pending.
- `c1-interface.md`: pinned C1 interface observations, harness binding design and temporary unsupported-response boundary; no C1 integration or execution.
- `c2-interface.md`: pinned submitted C2 persistence/Cloud/notification contracts; full integration and product verification pending.
- `receiver.ts`, `responses.ts`, `harness.ts`: temporary HTTP fixtures and the real server `execAgent({ hooks })` entry seam. No product configuration endpoint.
- `self-check.ts`: verifies fixture server behavior only; does not exercise LobeHub.
- `protocol.{en,zh-CN}.draft.md`: unpublished bilingual drafts, eventual location `docs/development/basic/agent-runtime-hooks{,.zh-CN}.mdx` after final verification.
- `environment.md`: observed prerequisites and exact remaining gaps.
- `environment-step2.md`: latest infrastructure results, dedicated gateway/device identity, service commands and remaining model/managed-QStash requirements.
- `dependency-incident.md`: preserved incident timing/error/path evidence, D-owned QStash binary and future installation/cache boundaries.
- `.acceptances/hooks-d-phase1/`: ignored preflight output and checker notes. Final product runs get a separate immutable round directory.

Phase 1 is complete when the checker findings are resolved, fixture smoke works, environment gaps have evidence and commands, and coordinator receives the paths. No product pass, final report ingestion, branch integration, or public PR in this phase.

## Run fixture smoke now

From this worktree root:

```bash
bun .agents/acceptance/scenarios/agent-hooks/self-check.ts
HOOK_RECEIVER_LOG="$PWD/.acceptances/hooks-d-phase1/assets/manual-receiver-1.jsonl" \
  bun .agents/acceptance/scenarios/agent-hooks/receiver.ts
```

Receiver binds loopback to an OS-allocated port and prints its URL. Each log path must be new (exclusive creation). `GET /health` proves the process responds; `POST /hooks/<fixture>` receives notifications or serves the selected control response. Stop this process with Ctrl-C. Never terminate a shared listener. Use only synthetic arguments/content; field redaction cannot detect secrets embedded in free text. Review all logs before publication. No request headers are written. Fixture query/path names are harness routing, not extra protocol fields.

`rewrite` currently returns `{path:'fixture/effective.txt'}` as the **whole** new tool input. Seed a compatible `d-fixture` tool before using it. Adjust fixture input to the actual final tool schema, not product code. `late-allow` waits 1200 ms; the default harness control timeout is 200 ms. For C07 set JSON `"scenario":"late-allow","timeout":5`, wait for receiver arrival, press Stop before 1200 ms and retain observation beyond that time. Compare with the same 5-second timeout and no Stop. This separates cancellation from timeout. Set `"notificationResponse":"deny"` to prove notifications ignore control-shaped responses. `size-boundary` and `oversized` are otherwise-valid JSON responses of exactly 65536/65537 UTF-8 bytes; distinguish the size-specific error from malformed JSON.

## Final runtime entry (wait for final base and actual provider/device prerequisites)

`harness.ts` calls the actual `AiAgentService.execAgent`; it does not replace the Runtime or dispatcher. A minimal JSON input, in an ignored directory, is:

```json
{
  "onError": "block",
  "params": { "agentId": "<seeded-agent>", "prompt": "Use the synthetic d-fixture tool once" },
  "receiver": "http://127.0.0.1:<printed-port>",
  "scenario": "deny",
  "userId": "<seeded-local-user>"
}
```

Run in an isolated environment loaded through the existing adapter; never point a production login at localhost or vice versa:

```bash
(
  unset LOBEHUB_JWT LOBEHUB_CLI_API_KEY LOBE_API_KEY LOBEHUB_WORKSPACE_ID
  source .records/env/hooks-d-isolation.env
  eval "$(.agents/acceptance/scripts/init-dev-env.sh env)"
  AGENT_RUNTIME_MODE=local bun .agents/acceptance/scenarios/agent-hooks/harness.ts .acceptances/hooks-d-phase1/run.json
)
```

Repeat with `AGENT_RUNTIME_MODE=queue` and a healthy QStash + real callback worker. `delivery:'qstash'` selects QStash **notifications**; controls always fetch. The harness returns after `execAgent` returns, not after completion. Observe the returned run through receiver/persisted state and real Web UI. It deliberately does not print `ExecAgentResult`, which may carry a gateway token. The final driver needs bounded state observation for completion and must preserve its local runtime process until terminal state; this is an entry harness, not an autonomous acceptance runner.

For worker replacement use two owned app processes sharing only the isolated test DB/Redis, and a recorded queue barrier. Do not simulate the worker swap with a second dispatcher in one process. Do not use the production debug proxy to claim backend branch coverage.

The continued preflight has now prepared D-owned dependencies, migrated Postgres/Redis, local QStash and S3, and a seeded CLI login. See `environment-ready.md` for current state and restart commands. This does not enable final Hook execution before the coordinator supplies the integrated base. The initial missing-eslint checkpoint remains historical; focused lint now passes.

## Execution order and publication gate

1. Record the coordinator's final SHA and dependency heads; verify ancestry and relevant diff. Read C1/C2 final interfaces and update fixture bindings. Prove served code by process cwd/build marker and an observable changed hook field.
2. Resolve environment gaps below, seed synthetic user/Agent/tool, and prove side-effect instrumentation with an allowed positive control. Fault probes require an observed hit and an unmodified comparison.
3. Run H01–H16 in local/queue with actual HTTP as applicable, then C01–C07 and D01–D08. Keep failures local, repair with responsible owner, rerun affected outcomes. Type failures require same-environment baseline/current diagnostics and changed-file delta, not automatic abandonment or false pass.
4. Capture real Web approval/tool cards and parent replies, cold reload persistence, and cancellation video. Inspect every image/video; text/database checks cannot replace required visual media.
5. Prepare Acceptance `result.json` with one result per plan id; attach separate reasoning and raw records with nonempty descriptions. Unavailable device/LLM/QStash/UI cases remain blocked/uncertain. Reuse valid upstream evidence with original provenance only.
6. Reuse the same acceptance-checker for exactly one evidence review before ingestion (plan feedback at most two). Publish only after the agreed evidence coverage gate, with the actual CLI-returned URL. Phase 1 performs none of this publication.
