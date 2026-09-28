import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HookDispatcher } from '../HookDispatcher';
import type { AgentHookEvent, AgentHookType, SerializedHook } from '../types';
import { createWebhookPayloadBuilder } from '../webhookPayload';

const { getEmailsByIds, publishJSON } = vi.hoisted(() => ({
  getEmailsByIds: vi.fn(),
  publishJSON: vi.fn(),
}));
vi.mock('@/database/models/user', () => ({ UserModel: { getEmailsByIds } }));
vi.mock('@/database/server', () => ({ getServerDB: async () => ({}) }));
vi.mock('@/server/services/queue/impls', () => ({ isQueueAgentRuntimeEnabled: () => true }));
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

const hookTypes: AgentHookType[] = [
  'beforeStep',
  'afterStep',
  'onComplete',
  'onError',
  'beforeToolCall',
  'afterToolCall',
  'onToolCallError',
  'beforeCompact',
  'afterCompact',
  'onCompactError',
  'beforeCallAgent',
  'afterCallAgent',
  'onCallAgentError',
  'beforeHumanIntervention',
  'afterHumanIntervention',
  'onStopByHumanIntervention',
];
const event: AgentHookEvent = { agentId: 'agent', operationId: 'run', userId: 'visitor' };
const received: Record<string, unknown>[] = [];
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  received.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.writeHead(200).end('{}');
});
let url: string;
let dispatcher: HookDispatcher;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
beforeEach(() => {
  dispatcher = new HookDispatcher();
  received.length = 0;
  getEmailsByIds
    .mockReset()
    .mockImplementation(async (_db, ids: string[]) =>
      ids.map((id) => ({ id, email: `${id}@example.test` })),
    );
  publishJSON.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const send = (type: AgentHookType = 'afterToolCall', webhook = { url }, payload = event) =>
  dispatcher.dispatch('run', type, payload, [{ id: 'notification', type, webhook }]);

describe('webhook user email', () => {
  it.each(hookTypes)('delivers the final user email for %s', async (type) => {
    await send(type);
    expect(received[0]).toMatchObject({
      userId: 'visitor',
      userEmail: 'visitor@example.test',
      hookType: type,
    });
    expect(event).not.toHaveProperty('userEmail');
  });

  it('does not authorize a different identity from webhook body', async () => {
    await dispatcher.dispatch('run', 'onComplete', event, [
      { id: 'external', type: 'onComplete', webhook: { url } },
      {
        id: 'internal',
        type: 'onComplete',
        webhook: { url, body: { userId: 'owner', userEmail: 'spoof@example.test' } },
      },
    ]);
    expect(received.map(({ userId, userEmail }) => ({ userId, userEmail }))).toEqual([
      { userId: 'visitor', userEmail: 'visitor@example.test' },
      { userId: 'owner', userEmail: undefined },
    ]);
    expect(event.userId).toBe('visitor');
    expect(getEmailsByIds).toHaveBeenCalledTimes(1);
    expect(getEmailsByIds).toHaveBeenCalledWith({}, ['visitor']);
  });

  it.each([{ rows: [] }, { rows: [{ id: 'visitor', email: null }] }])(
    'omits an unavailable email without an owner fallback',
    async ({ rows }) => {
      getEmailsByIds.mockResolvedValue(rows);
      await send();
      expect(received[0]).toHaveProperty('userId', 'visitor');
      expect(received[0]).not.toHaveProperty('userEmail');
    },
  );

  it('continues delivery when the lookup fails', async () => {
    getEmailsByIds.mockRejectedValue(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await send();
    expect(received[0]).toHaveProperty('userId', 'visitor');
    expect(received[0]).not.toHaveProperty('userEmail');
  });

  it('does not look up email when eventFields excludes it', async () => {
    await dispatcher.dispatch('run', 'onComplete', event, [
      {
        id: 'projected',
        type: 'onComplete',
        webhook: { url, eventFields: ['userId'] },
      },
    ]);
    expect(received[0]).not.toHaveProperty('userEmail');
    expect(getEmailsByIds).not.toHaveBeenCalled();
  });

  it('allows selecting email without including the id', async () => {
    await dispatcher.dispatch('run', 'onComplete', event, [
      {
        id: 'projected',
        type: 'onComplete',
        webhook: { url, eventFields: ['userEmail'] },
      },
    ]);
    expect(received[0]).toHaveProperty('userEmail', 'visitor@example.test');
    expect(received[0]).not.toHaveProperty('userId');
  });

  it('shares a lookup across concurrent events and refreshes after expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await Promise.all([send(), send('onComplete')]);
    expect(getEmailsByIds).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1000 + 5 * 60 * 1000);
    getEmailsByIds.mockResolvedValue([{ id: 'visitor', email: 'updated@example.test' }]);
    await send();
    expect(getEmailsByIds).toHaveBeenCalledTimes(2);
    expect(received[2]).toHaveProperty('userEmail', 'updated@example.test');
  });

  it.each([undefined, null, '', 42])(
    'does not substitute the event identity for an invalid final body id %s',
    async (userId) => {
      await dispatcher.dispatch('run', 'onComplete', event, [
        {
          id: 'invalid-id',
          type: 'onComplete',
          webhook: { url, body: { userId, userEmail: 'spoof@example.test' } },
        },
      ]);
      expect(received[0]).not.toHaveProperty('userEmail');
      expect(getEmailsByIds).not.toHaveBeenCalled();
    },
  );

  it('drops supplied email when no authoritative email is available', async () => {
    getEmailsByIds.mockResolvedValue([]);
    await dispatcher.dispatch(
      'run',
      'onComplete',
      Object.assign({}, event, { userEmail: 'event@example.test' }),
      [
        {
          id: 'spoof',
          type: 'onComplete',
          webhook: { url, body: { userEmail: 'body@example.test' } },
        },
      ],
    );
    expect(received[0]).not.toHaveProperty('userEmail');
  });

  it('resolves identity again in a restored worker', async () => {
    await send();
    dispatcher = new HookDispatcher();
    getEmailsByIds.mockResolvedValue([{ id: 'visitor', email: 'new@example.test' }]);
    await send();
    expect(received[1]).toHaveProperty('userEmail', 'new@example.test');
    expect(getEmailsByIds).toHaveBeenCalledTimes(2);
  });

  it('bounds cached identities instead of retaining every user for the process lifetime', async () => {
    const build = createWebhookPayloadBuilder();
    const metadata = { hookId: 'hook', hookType: 'onComplete' as const };
    await build(event, {}, metadata);
    for (let index = 0; index < 1000; index++) {
      await build({ ...event, userId: `user-${index}` }, {}, metadata);
    }
    await build(event, {}, metadata);
    expect(getEmailsByIds).toHaveBeenCalledTimes(1002);
  });

  it('does not disclose another user even when that user is already cached', async () => {
    await send('onComplete', { url }, { ...event, userId: 'owner' });
    await dispatcher.dispatch('run', 'onComplete', event, [
      {
        id: 'untrusted',
        type: 'onComplete',
        webhook: { url, body: { userId: 'owner' } },
      },
    ]);
    expect(received[0]).toHaveProperty('userEmail', 'owner@example.test');
    expect(received[1]).not.toHaveProperty('userEmail');
    expect(getEmailsByIds).toHaveBeenCalledTimes(1);
  });

  it('continues without email after a bounded lookup wait', async () => {
    vi.useFakeTimers();
    getEmailsByIds.mockReturnValue(new Promise(() => {}));
    const pending = createWebhookPayloadBuilder()(
      event,
      {},
      { hookId: 'hook', hookType: 'onComplete' },
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).not.toHaveProperty('userEmail');
  });

  it('cancels a waiter without cancelling another shared lookup', async () => {
    let complete!: (rows: { id: string; email: string }[]) => void;
    getEmailsByIds.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const build = createWebhookPayloadBuilder();
    const controller = new AbortController();
    const metadata = { hookId: 'control', hookType: 'beforeToolCall' as const };
    const cancelled = build(event, {}, metadata, { signal: controller.signal });
    const sibling = build(event, {}, metadata);
    controller.abort();
    expect(await cancelled).toBeUndefined();
    complete([{ id: 'visitor', email: 'visitor@example.test' }]);
    expect(await sibling).toHaveProperty('userEmail', 'visitor@example.test');
    expect(getEmailsByIds).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(0);
  });

  it('does not start a lookup for an already aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await createWebhookPayloadBuilder()(
        event,
        {},
        { hookId: 'control', hookType: 'beforeToolCall' },
        { signal: controller.signal },
      ),
    ).toBeUndefined();
    expect(getEmailsByIds).not.toHaveBeenCalled();
  });

  it('preserves control-specific input without requiring a notification event shape', async () => {
    const args = { query: 'effective' };
    const originalArgs = { query: 'original' };
    const payload = await createWebhookPayloadBuilder()(
      { userId: 'visitor', args, originalArgs },
      {},
      { hookId: 'control', hookType: 'beforeToolCall' },
    );
    expect(payload).toMatchObject({ args, originalArgs, userEmail: 'visitor@example.test' });
  });

  it('includes the resolved email in QStash JSON', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'test-token');
    const queued: SerializedHook = {
      id: 'queued',
      type: 'onComplete',
      webhook: { url, delivery: 'qstash', fallback: 'none' },
    };
    await dispatcher.dispatch('run', 'onComplete', event, [queued]);
    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: 'visitor', userEmail: 'visitor@example.test' }),
      }),
    );
  });
});
