# Agent Runtime HTTP hooks — unpublished integration draft

This draft describes the agreed integrated contract. It is not release documentation. D currently starts at F `66af6210`, where registration/restoration deliberately rejects control mode. C1/C2 and notification producer changes must be integrated and verified before publishing this page at `docs/development/basic/agent-runtime-hooks.mdx`.

C1 interface checkpoint: coordinator-supplied `f055aa20931d864d500779ea77e6b14800055f29` implements allow/deny, but treats any response containing `updatedInput` or `additionalContext` as wholly unsupported (`onError` applies, with no partial decision). D has inspected this contract without integrating it. The rewrite/context and complete approval behavior below still requires C2 and the final integrated base. See `c1-interface.md`.

## Register hooks in server code

Hooks belong to one server Agent operation. Pass them to `AiAgentService.execAgent({ hooks })` from trusted application code with an existing database, user, and Agent. `hooks` is a server programming option, not a browser request field, global policy, configuration file, environment-based deployment switch, or management UI.

```ts
import type { AgentHook } from '@/server/services/agentRuntime/hooks/types';

const hooks: AgentHook[] = [
  {
    id: 'observe-tools',
    type: 'afterToolCall',
    matcher: '^example-tools/',
    webhook: { url: 'https://hooks.example.com/events', timeout: 5 },
  },
  {
    id: 'check-tool',
    type: 'beforeToolCall',
    matcher: '^example-tools/writeFile$',
    webhook: {
      url: 'https://hooks.example.com/check',
      delivery: 'fetch',
      responseHandling: 'toolCall',
      onError: 'block',
      timeout: 5,
      headers: { Authorization: 'Bearer ${HOOK_TEST_TOKEN}' },
      allowedEnvVars: ['HOOK_TEST_TOKEN'],
    },
  },
];
await aiAgentService.execAgent({ agentId, prompt, hooks });
```

The variables `aiAgentService`, `agentId`, and `prompt` come from your server integration. The example token name only demonstrates an explicitly allowlisted header template; it does not add a Hook deployment configuration entry. Templates are persisted unexpanded and resolved at delivery time. Never log expanded credentials.

`matcher` is a **string regular expression** tested against the combined name `${identifier}/${apiName}`. Omitted, empty, or `*` matches every tool. It is valid only for `beforeToolCall`, `afterToolCall`, and `onToolCallError`. Use anchors when an exact match is intended. Invalid patterns and non-tool matchers are rejected on registration and restoration.

## Delivery modes

| Registration                     | Local server runtime | Queue server runtime                       |
| -------------------------------- | -------------------- | ------------------------------------------ |
| webhook only                     | HTTP delivery        | HTTP delivery from persisted configuration |
| handler and notification webhook | in-memory handler    | webhook                                    |
| handler only                     | in-memory handler    | no persisted handler delivery              |

Runtime mode and webhook transport are different choices. `delivery:'fetch'` (default) awaits the HTTP request even in queue runtime. `delivery:'qstash'` publishes a notification to QStash; acknowledgement means the queue accepted it, not that the target received it. A QStash publish failure uses the existing fetch fallback unless `fallback:'none'` disables it. QStash cannot carry control responses.

Synchronous HTTP does not automatically retry. Queue replay can issue the request again, and queue transport may redeliver. There is no outbox or exactly-once guarantee. Consumers should handle duplicates using the event's available operation/tool identity and their own business rules; no new request ID or correlation echo is required by this protocol.

## Request and response

Requests are JSON POSTs containing the hook event plus `hookId` and `hookType`. Tool events retain `identifier`, `apiName`, and `args`, with native `toolCallId`, `originalArgs`, execution source/target and available run associations supplied by the integrated producer. Optional associations depend on the actual runtime origin; do not invent parent IDs. Notification `eventFields`/`body` compatibility remains available, but control requests reject filtering or payload overrides. Remote payloads omit `finalState`.

Only a `beforeToolCall` webhook with `responseHandling:'toolCall'` interprets this response:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "beforeToolCall",
    "permissionDecision": "allow",
    "permissionDecisionReason": "The operation is permitted",
    "updatedInput": { "path": "notes/example.txt", "content": "Example" },
    "additionalContext": "Use the approved destination for this tool call."
  }
}
```

`permissionDecision` accepts `allow` or `deny`. It is optional. `updatedInput` requires `allow` and replaces the entire input object. `additionalContext` can be supplied without a permission decision and is limited to 10,000 characters. The response body is limited to 64 KiB. Empty successful responses or `{}` mean no decision. Invalid JSON, non-2xx responses, network failures, timeouts and unsupported response fields are protocol failures. The strict schema rejects `ask`, `defer`, whole-run stop and tool-output rewrites; these are not silently treated as supported.

`timeout` is in seconds, default 30. `onError` defaults to `continue`; `block` is available only in control mode. A control hook cannot also have a handler, use QStash, filter event fields or override the payload. Notifications default to `responseHandling:'ignore'`, and their responses cannot change the run. URLs follow existing SSRF protection and private-network policy. Fetch delivery rejects redirects so destination changes cannot leak credentials.

## Tool control and approvals — requires final C1/C2 verification

Controls run before permission checks, approval and batch lane planning, and before mock or real effects. Registered controls run in order; the next sees the previous effective input. A deny blocks that tool with zero attempts, without invoking mock, execution billing or tool retry. It does not stop the entire Agent. Allow still respects platform permission checks and human approval.

The same effective input must reach permissions, approval UI, serialized preparation, resource lanes, execution and after-events. Internal tool retries reuse preparation. Approval recovery rechecks from original input; changed effective input invalidates the old approval. Cancellation ends the wait; a late allow cannot start a tool. Both legacy approval resume and modern continuation retain the configured hooks.

Additional context is saved with the tool record, made available to subsequent model context, and deduplicated by tool call and hook. It does not edit user messages or gain system-message privilege. These paragraphs are intended contract, not a claim that F alone implements them.

## Events

| Event                     | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| beforeToolCall            | Tool preparation; the only HTTP control point                                  |
| afterToolCall             | Final parameters and structured result, including blocked results              |
| onToolCallError           | An actual tool exception, not a hook denial                                    |
| beforeHumanIntervention   | Pending native tool IDs and effective input before approval                    |
| afterHumanIntervention    | Approval/rejection action, reason and affected tool IDs                        |
| onStopByHumanIntervention | Human stop/rejection that halts the run, with affected IDs                     |
| beforeStep                | Step about to execute                                                          |
| afterStep                 | Step content/results and usage statistics                                      |
| onComplete                | Terminal reason, final response, attachments and statistics; not async parking |
| onError                   | Original business error and run association                                    |
| beforeCompact             | Message/token counts before context compression                                |
| afterCompact              | Compression message-group ID, counts and summary                               |
| onCompactError            | Compression's actual error and token context                                   |
| beforeCallAgent           | Parent operation is about to create/start a child                              |
| afterCallAgent            | Child creation/start returned; **not child completion**                        |
| onCallAgentError          | Child creation/start failed or threw                                           |

Every event except configured `beforeToolCall` control is notification-only. A shared-group child may have no isolated `threadId`. Child completion is its own `onComplete`; parent hooks are not automatically inherited by child operations.

Compression notifications are awaited, so a slow receiver adds latency. Notification failure must not roll back compression or alter its retry behavior. Existing critical callbacks with `fallback:'none'` retain critical failure propagation: failure must not recursively alter the business terminal state or emit extra terminal notifications. Error-path state reload may fall back only to the state already loaded within that execution, preserving the original error.

## Coverage limits

The integration covers tools controlled by the server Runtime, including its client/device forwarding paths. It does not instrument an independent client Runtime or tools inside heterogeneous Agents. No global mandatory governance, automatic child inheritance, output rewriting, outbox or exactly-once delivery is provided. Final documentation must be checked against the coordinator's integrated revision and real local/queue/device/Web outcomes before publication.
