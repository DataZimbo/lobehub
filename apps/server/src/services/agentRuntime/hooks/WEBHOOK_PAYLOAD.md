# Webhook user email

Notification webhook payloads include `userEmail` when the user identified by the
final `userId` has an email in the users table. The shared dispatcher handles all
16 notification types. Local function handlers and the runtime execution account
are unchanged.

- Static `webhook.body.userId` overrides retain their existing behavior, including
  internal callbacks that use the owner account. If the override differs from
  the trusted producer event userId, email is omitted: static body cannot authorize
  querying another account, even when that account is already cached.
- Caller-supplied `userEmail` is replaced by the database value. A missing user,
  null email, missing/invalid ID, or lookup failure omits the field; there is no
  fallback to another user's email. Lookup failures are logged and do not suppress
  the notification. Lookup waits are bounded to one second.
- `eventFields` continues to select output fields. Include `userEmail` to request
  it in a projection; it can be selected without `userId`. An explicit projection
  that excludes email performs no lookup.
- Concurrent lookups share a promise. Each dispatcher caches at most 1,000 user
  identities for five minutes, including absent emails and lookup failures.
  Expiry or eviction causes a new lookup. Each worker has its own cache; this is
  delivery-time enrichment, not a durable snapshot for the whole operation.
- Fetch and QStash receive the enriched payload. QStash retries reuse the published
  payload; a runtime replay on another worker can read a newer email.

This branch does not implement synchronous HTTP tool controls. On integration,
control requests must use the same enrichment with the authoritative tool event,
without `body` overrides or `eventFields` projection. Pass `{ signal }` as the
fourth argument; cancellation returns `undefined`, which the control caller must
map to `cancelled` without sending HTTP. The shared DB lookup may finish in the
background; cancelling one waiter does not cancel other callers. Generic input
retains control-only fields without adding them to public notification types. Existing `args` and `content`
fields retain their contracts.
