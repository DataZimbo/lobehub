import type { AgentHookType } from '@lobechat/agent-runtime';

import type { AgentHookWebhook, AgentHookWebhookPayload } from './types';

const EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const EMAIL_CACHE_CAPACITY = 1000;

/** Email is optional enrichment; database failures must not suppress the hook. */
const readUserEmail = async (userId: string): Promise<string | undefined> => {
  try {
    const [{ UserModel }, { getServerDB }] = await Promise.all([
      import('@/database/models/user'),
      import('@/database/server'),
    ]);
    const users = await UserModel.getEmailsByIds(await getServerDB(), [userId]);
    return users.find((user) => user.id === userId)?.email ?? undefined;
  } catch {
    console.error('[HookDispatcher] Failed to resolve webhook user email');
    return undefined;
  }
};

/** The producer operation id identifies the durable execution owner. */
const readOperationOwner = async (operationId: string): Promise<string | undefined> => {
  try {
    const { getServerDB } = await import('@/database/server');
    const db = await getServerDB();
    const operation = await db.query.agentOperations.findFirst({
      columns: { userId: true },
      where: (table, { eq }) => eq(table.id, operationId),
    });
    return operation?.userId;
  } catch {
    console.error('[HookDispatcher] Failed to resolve webhook operation owner');
    return undefined;
  }
};

/** Bound optional enrichment and allow each waiter to cancel independently. */
const waitForEmail = (value: Promise<string | undefined>, signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.resolve(undefined);
  return new Promise<string | undefined>((resolve) => {
    const finish = (email?: string) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(email);
    };
    const onAbort = () => finish();
    const timer = setTimeout(finish, 1000);
    signal?.addEventListener('abort', onAbort, { once: true });
    void value.then(finish);
  });
};

/**
 * Per-dispatcher bounded cache, including pending lookups and missing emails.
 * Workers resolve independently; this is a five-minute delivery-time cache,
 * not a persisted run identity snapshot.
 */
const createCachedLookup = (read: (key: string) => Promise<string | undefined>) => {
  const entries = new Map<string, { expiresAt: number; value: Promise<string | undefined> }>();
  return (key: string) => {
    const now = Date.now();
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    entries.delete(key);
    if (entries.size >= EMAIL_CACHE_CAPACITY) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    const value = waitForEmail(read(key));
    entries.set(key, { expiresAt: now + EMAIL_CACHE_TTL_MS, value });
    return value;
  };
};

export const createWebhookPayloadBuilder = () => {
  const resolveEmail = createCachedLookup(readUserEmail);
  const resolveOwner = createCachedLookup(readOperationOwner);

  return async <T extends { operationId?: string; userId?: string }>(
    event: T,
    webhook: Pick<AgentHookWebhook, 'body' | 'eventFields'>,
    metadata: { hookId: string; hookType: AgentHookType },
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentHookWebhookPayload | undefined> => {
    const { signal } = options;
    if (signal?.aborted) return undefined;
    const { body, eventFields } = webhook;
    const selected: Record<string, unknown> = eventFields ? {} : { ...event };
    if (eventFields) {
      for (const field of eventFields) {
        if (field in event) selected[field] = event[field as keyof T];
      }
    }
    const payload: AgentHookWebhookPayload = { ...selected, ...metadata, ...body };
    delete payload.finalState;
    // Identity comes from the producer or its durable operation, never webhook body alone.
    delete payload.userEmail;
    const userId = 'userId' in payload ? payload.userId : event.userId;
    if (
      (!eventFields || eventFields.includes('userEmail')) &&
      typeof userId === 'string' &&
      userId
    ) {
      const lookup = async () => {
        if (userId !== event.userId) {
          if (!event.operationId) return undefined;
          const ownerId = await resolveOwner(event.operationId);
          if (ownerId !== userId || signal?.aborted) return undefined;
        }
        return resolveEmail(userId);
      };
      // One deadline covers owner validation and email lookup together.
      const email = await waitForEmail(lookup(), signal);
      if (signal?.aborted) return undefined;
      if (email !== undefined) payload.userEmail = email;
    }
    return payload;
  };
};
