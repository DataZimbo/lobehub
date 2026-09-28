# Tool control preparation

`execAgent({ hooks })` accepts synchronous `beforeToolCall` webhooks using
`responseHandling: 'toolCall'` and fetch delivery. F's shared registration schema,
`matchesHook` string matcher (identifier/apiName), and response parser apply to
both local registration and persisted worker configuration. Ordinary notification
dispatch skips controls; `deliverWebhook` rejects a control configuration.

Controls run in registration order before GeneralChatAgent permission/audit and
approval decisions, and before single/batch executor lane planning. Each control
sees the previous accepted input. `updatedInput` is a complete replacement, only
on allow. `additionalContext` is retained with the call, including denied calls.
A deny stops only its tool: blocked result, zero attempts, no mock, real execution,
retry, or execution fee. Allow still goes through product permissions and approval.
Cancellation stops waiting and a late allow cannot start execution.

All controls run before observation/mock handlers. A local before handler is
called once; the first mock wins. Legacy dual handler/webhook hooks select the
handler locally and the webhook in queue mode. Critical notification callbacks
retain `fallback: 'none'` failure propagation.

## Preparation and persistence

- `RuntimeConfig.prepareTools(context, state)` runs before runtime decisions;
  `createRuntimeToolPreparation` wires the server to `createToolPreparation`.
- `ToolTransport.prepare` returns serializable `ToolCallPreparation`:
  `originalArgs`, optional `effectiveArgs`, `additionalContexts: {hookId,text}[]`,
  optional reviewed `approvalArgs`, `status: ready | blocked | cancelled`, `reason?`.
- `prepareToolCalls` is also used by direct executors before lane planning.
  `state.toolPreparations[nativeCallId]` is scoped by `toolPreparationParentId`
  (the original assistant turn). Internal execution retries reuse preparation.
  The caller's context is cloned, so a retained step context cannot accumulate
  rewrites on retry.
- The effective input is shared by audits, pending cards, lane serialization,
  server/device/client dispatch and before/after/error payloads. T's
  `originalArgs` is a separate cloned snapshot of the model's input.
- Existing tool rows store `pluginState.hookPreparation`. `updateToolCall`
  atomically updates plugin arguments and preparation, without a new table or
  process-global cache. Human resolution records `approvedArguments` in the
  existing intervention data before any resumed rewrite can change the row.

## Approval recovery

Both legacy in-place `human_approved_tool` and new continuation workers load the
original input from the existing tool row and rerun controls. They compare the
new effective input with the reviewed snapshot, not with the now-mutable plugin
arguments. A changed input re-enters the normal agent permission/audit path;
`human_approved_tool` cannot grant approval for the changed request. A new deny
produces a blocked result with no execution.

When a changed call needs human approval again, reuse its tool message and
supersede the review batch, carrying all still-pending siblings. The generic
`supersedes.reapprovedToolCallIds` field identifies decided members being reopened
with a different request revision. Cross-operation continuations create a new
review batch. In-place recovery rotates the existing member's review token and
request revision atomically because `(operationId, toolCallId)` is unique. The
old resolution remains in the existing resolution ledger. Same-request replay is
idempotent. Any business-server overlay implementing `notifyAgentIntervention`
must forward this optional supersedes field to `createBatchWithSupersession`.

## Additional context

`ToolHookContextProvider` projects the persisted fragments through MessagesEngine
onto the ordinary tool result, escaped and deduplicated by tool row/native call
and hook ID. It creates no user or system messages and does not modify stored
result content. Queue workers reconstruct the same projection from tool rows;
reprocessing an already projected message does not append the fragment twice.
Recovery retains prior fragments and replaces a hook's fragment if it returns
updated guidance.

## Intervention notifications

The existing four `@lobechat/agent-runtime` human-intervention builders define
before/after/stop context and native ID semantics. Before notification uses the
same effective pending calls as the approval card. New continuations inherit
source hooks (including serialized webhook hooks) and persist after events on
the host envelope. Actions are grouped by action and rejection reason; each event
contains only the calls decided by that group. Claim and rollback do not dispatch.
The first executing continuation consumes events under the existing step lock;
deterministic reuse resumes the saved envelope instead of generating events again.

The persistence/delivery order for D's recovery checks is:

1. Atomically claim the human decisions on the existing tool rows. No notification
   is dispatched by the claim or its rollback.
2. Create the continuation with source hooks and grouped events in `host`, then
   persist its existing preparation/ready marker before scheduling its first step.
3. Under the execution step lock, load the saved envelope. For each action group,
   await the existing dispatcher, save a new envelope containing only the remaining
   groups, and only then update the in-memory ledger. A failed save keeps the
   original in-memory ledger intact.
4. A replacement worker or deterministic reuse reads this same saved remainder.
   A later group's failure does not resend groups whose checkpoint succeeded.
   Concurrent deliveries that do not obtain the step lock do not consume events.

The legacy original-operation handler sends its own notifications directly and
does not create a continuation ledger. The modern claim accepts pending rows or
its exact deterministic resolution ID; a row already resolved by the legacy
handler cannot start a second modern handoff. The ready-continuation reuse path
neither regenerates events nor calls the legacy handler.

Explicit stop is a separate inline path, because no next worker may exist. Its
order is: validate all pending members, atomically settle their rows, acknowledge
runtime interruption, persist operation completion, then directly dispatch the
stop event with every affected native ID. It neither starts a continuation nor
uses the after-event ledger. A normal replay of an already interrupted,
same-resolution stop skips notification; an unacknowledged/failed persistence of
the stop sends none. Ordinary modern reject does not fabricate a stop; the legacy
reject-and-halt handler retains its existing actual-halt semantics.

Notification response bodies are ignored, even if they resemble a control
response. They cannot change tool inputs, cancellation, or human decisions.
Delivery failures retain the existing dispatcher policy: ordinary notification
failures are logged/swallowed, so the action group is consumed; a critical
`fallback: 'none'` error exits the drain with that group still pending. Step-level
critical-error propagation/retry is the separate L change, not a new C2 retry
loop. Within a group, a retry may redeliver to an earlier hook if a later critical
hook failed; the ledger checkpoint is per action group, not per HTTP endpoint.

HTTP controls do not retry automatically. A replay before preparation is saved
may issue another HTTP request. For continuation notifications, a crash before
delivery leaves the group pending; a crash after delivery but before saving its
checkpoint may repeat it. If the checkpoint succeeded, a normal replacement
worker does not repeat that group. Inline stop and the legacy direct handler keep
their existing delivery reliability: a process crash after the terminal write but
before dispatch can lose a notification, and an already terminal stop replay does
not reconstruct one. A notification delivery error never rolls back the completed
stop or human decision. There is no independent outbox, guaranteed delivery, or
cross-crash exactly-once claim.

## Verification boundary

C2's regression suite covers runtime/dispatcher/transport, database persistence,
approval re-planning, context projection and notification recovery. D owns real
HTTP/QStash, rendered cards and device acceptance. These tests do not claim that
product acceptance has completed; keep the integration PR draft until D reports.
