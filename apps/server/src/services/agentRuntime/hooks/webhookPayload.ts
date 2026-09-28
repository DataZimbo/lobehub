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
  } catch (error) {
    console.error('[HookDispatcher] Failed to resolve webhook user email', error);
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
export const createWebhookPayloadBuilder = () => {
  const emails = new Map<string, { expiresAt: number; value: Promise<string | undefined> }>();
  const resolveEmail = (userId: string) => {
    const now = Date.now();
    const cached = emails.get(userId);
    if (cached && cached.expiresAt > now) return cached.value;
    emails.delete(userId);
    if (emails.size >= EMAIL_CACHE_CAPACITY) {
      const oldest = emails.keys().next().value;
      if (oldest !== undefined) emails.delete(oldest);
    }
    const value = waitForEmail(readUserEmail(userId));
    emails.set(userId, { expiresAt: now + EMAIL_CACHE_TTL_MS, value });
    return value;
  };

  return async <T extends { userId?: string }>(
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
    // Only the trusted producer event authorizes an email lookup, never webhook body.
    delete payload.userEmail;
    const userId = 'userId' in payload ? payload.userId : event.userId;
    if (
      (!eventFields || eventFields.includes('userEmail')) &&
      typeof userId === 'string' &&
      userId &&
      userId === event.userId
    ) {
      const pending = resolveEmail(userId);
      const email = await (signal ? waitForEmail(pending, signal) : pending);
      if (signal?.aborted) return undefined;
      if (email !== undefined) payload.userEmail = email;
    }
    return payload;
  };
};
