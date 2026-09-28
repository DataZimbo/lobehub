# Tool control preparation (C1)

`execAgent({ hooks })` accepts synchronous `beforeToolCall` webhooks using
`responseHandling: 'toolCall'` and fetch delivery. The shared hook schema still
validates registration and persisted configuration. Ordinary notification dispatch
skips controls; `deliverWebhook` continues to reject a control configuration.

Controls run in registration order before the GeneralChatAgent permission and
approval decisions and before single/batch executor lane planning. A deny stops
only its tool: it persists a blocked result with zero attempts, no mock, no real
execution, no tool retry and no execution fee. Allow still goes through the
product's permission and approval checks. Cancellation stops waiting and a late
allow cannot start execution.

The implementation uses F's `executeToolCallWebhook` and `matchesHook`, and T's
`buildToolCallHookContext`, native tool call ID and `originalArgs`. All controls
run before observation/mock handlers. A local before handler is called once;
the first mock wins. Legacy dual handler/webhook hooks select the handler locally
and the webhook in queue mode. Webhook-only notifications work in either mode.
Critical notification callbacks retain `fallback: 'none'` failure propagation.

## Preparation contract for C2

- `RuntimeConfig.prepareTools(context, state)` runs before runtime decisions.
- `createRuntimeToolPreparation(ctx)` wires the server to the shared
  `createToolPreparation(host)` implementation.
- `ToolTransport.prepare(call, context)` returns serializable
  `ToolCallPreparation { originalArgs, status: 'ready' | 'blocked' | 'cancelled', reason? }`.
- `prepareToolCalls(host, state, calls, parentMessageId, stepContext?)` is also
  called by direct single/batch executors before lane planning. Preparation is
  stored in `state.toolPreparations[nativeCallId]`, scoped by
  `state.toolPreparationParentId` so provider call ID reuse across assistant turns
  cannot reuse an old decision. Internal tool retries reuse preparation.
- `ToolRunContext.originalArgs` carries the retained original input to T's
  before/after/error builders. The transport handles blocked results before mock
  and device/real execution and dispatches the unsuccessful, non-mocked after event.
- `human_approved_tool` clears the corresponding cached decisions and rechecks
  controls. C2 owns original-input rewriting, effective parameter consistency,
  old-approval invalidation and continuation hook preservation across both approval
  flows. This draft does not claim those cases are complete.

## Temporary C1 response restriction

C1 only implements allow/deny. Even when the shared parser accepts them,
`updatedInput` and `additionalContext` are explicitly treated as unsupported
control responses: `onError: 'block'` blocks with `unsupported_control_response`;
the default `continue` executes unchanged input. No partial response decision is
applied. C2 must remove this restriction only after integrating both fields into
the preparation, approval and context pipelines.

HTTP controls do not retry automatically. Persisted hook configuration is usable
by a replacement worker; a replay that precedes a saved preparation may issue a
new HTTP request. This adds no outbox or cross-replay exactly-once guarantee.

F/T are fixed foundational dependencies; product HTTP/QStash, rendered cards,
device dispatch and complete approval-continuation acceptance remain assigned
to D/C2. Unit/integration tests are not product acceptance. Keep this PR draft.
