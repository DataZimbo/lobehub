import type { SerializedAgentHook } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HookDispatcher, UnsupportedControlHookError } from '../HookDispatcher';
import { matchesHook } from '../matcher';
import type { AgentHook, AgentHookEvent } from '../types';

const { safeFetch, queueMode } = vi.hoisted(() => ({ safeFetch: vi.fn(), queueMode: vi.fn() }));
vi.mock('@lobechat/ssrf-safe-fetch', () => ({ ssrfSafeFetch: safeFetch }));
vi.mock('@/server/services/queue/impls', () => ({ isQueueAgentRuntimeEnabled: queueMode }));
vi.mock('@/libs/qstash', () => ({ OtelQstashClient: class {} }));

const event: AgentHookEvent = {
  operationId: 'op',
  userId: 'user',
  agentId: 'agent',
  status: 'done',
};
const hook: AgentHook = {
  id: 'notification',
  type: 'onComplete',
  webhook: { url: 'https://example.com/hooks' },
};

describe('hook registration and restoration', () => {
  beforeEach(() => {
    safeFetch.mockReset().mockImplementation(async () => new Response('{}'));
    queueMode.mockReturnValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it.each([false, true])('sends webhook-only hooks in queue=%s', async (queue) => {
    queueMode.mockReturnValue(queue);
    const dispatcher = new HookDispatcher();
    dispatcher.register('op', [hook]);
    await dispatcher.dispatch('op', 'onComplete', event);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(safeFetch.mock.calls[0][1].body)).toMatchObject({
      operationId: 'op',
      hookId: 'notification',
    });
  });
  it.each([false, true])(
    'restores and validates notifications in a new worker queue=%s',
    async (queue) => {
      queueMode.mockReturnValue(queue);
      const dispatcher = new HookDispatcher();
      dispatcher.register('op', [hook]);
      const restored = new HookDispatcher();
      const persisted = JSON.stringify(dispatcher.getSerializedHooks('op'));
      await restored.dispatch('op', 'onComplete', event, JSON.parse(persisted));
      expect(safeFetch).toHaveBeenCalledTimes(1);
    },
  );
  it('retains dual handler/webhook mode selection', async () => {
    const handler = vi.fn();
    const dispatcher = new HookDispatcher();
    dispatcher.register('op', [{ ...hook, handler }]);
    await dispatcher.dispatch('op', 'onComplete', event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(safeFetch).not.toHaveBeenCalled();
    queueMode.mockReturnValue(true);
    await dispatcher.dispatch('op', 'onComplete', event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
  it('retains matcher and fallback:none through serialization', () => {
    const dispatcher = new HookDispatcher();
    const serialized = {
      id: 'tool',
      type: 'afterToolCall' as const,
      matcher: { identifier: '^fs$' },
      webhook: { url: '/hook', fallback: 'none' as const },
    };
    dispatcher.register('op', [serialized]);
    expect(dispatcher.getSerializedHooks('op')).toEqual([serialized]);
  });
  it('blocks unsupported controls on registration atomically and on restore before event selection', async () => {
    const dispatcher = new HookDispatcher();
    const control: AgentHook = {
      id: 'control',
      type: 'beforeToolCall',
      webhook: { url: '/hook', responseHandling: 'toolCall' },
    };
    expect(() => dispatcher.register('op', [hook, control])).toThrow(UnsupportedControlHookError);
    expect(dispatcher.hasHooks('op')).toBe(false);
    for (const queue of [false, true]) {
      queueMode.mockReturnValue(queue);
      await expect(
        dispatcher.dispatch('op', 'onComplete', event, [control as SerializedAgentHook]),
      ).rejects.toThrow(UnsupportedControlHookError);
    }
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'empty', type: 'onComplete' },
    { ...hook, handler: 'not a function' },
    { ...hook, matcher: {} },
    { ...hook, type: 'beforeToolCall', matcher: { apiName: '[' } },
    {
      ...hook,
      type: 'beforeToolCall',
      handler: async () => {},
      webhook: { url: '/hook', responseHandling: 'toolCall' },
    },
  ])('rejects invalid registration %#', (invalid) => {
    expect(() => new HookDispatcher().register('op', [invalid as AgentHook])).toThrow();
  });
  it('rejects corrupt restored configurations instead of stripping controls', async () => {
    await expect(
      new HookDispatcher().dispatch('op', 'onComplete', event, [
        {
          ...hook,
          webhook: { url: '/hook', responseHandling: 'futureControl' },
        } as unknown as SerializedAgentHook,
      ]),
    ).rejects.toThrow();
  });
  it('matches local handlers, HTTP notifications and mock callbacks', async () => {
    const dispatcher = new HookDispatcher();
    const handler = vi.fn();
    dispatcher.register('op', [
      {
        id: 'mock',
        type: 'beforeToolCall',
        matcher: { identifier: '^fs$', apiName: '^read' },
        handler,
      },
      { ...hook, type: 'beforeToolCall', matcher: { identifier: '^fs$' } },
    ]);
    const tool = { apiName: 'readFile', args: {}, callIndex: 0, identifier: 'other', stepIndex: 0 };
    await dispatcher.dispatchBeforeToolCall('op', tool);
    await dispatcher.dispatch('op', 'beforeToolCall', { ...tool, operationId: 'op' });
    expect(handler).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
    await dispatcher.dispatch('op', 'beforeToolCall', {
      ...tool,
      identifier: 'fs',
      operationId: 'op',
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
});

describe('matcher semantics', () => {
  it.each([undefined, {}, { identifier: '' }, { apiName: '*' }])(
    'matches wildcard %#',
    (matcher) => {
      expect(matchesHook(matcher, { identifier: 'any', apiName: 'any' })).toBe(true);
    },
  );
  it('requires both expressions and never retains regex state', () => {
    const matcher = { identifier: '^fs$', apiName: '^read' };
    for (let i = 0; i < 3; i++)
      expect(matchesHook(matcher, { identifier: 'fs', apiName: 'readFile' })).toBe(true);
    expect(matchesHook(matcher, { identifier: 'fs', apiName: 'writeFile' })).toBe(false);
    expect(matchesHook(matcher, { identifier: 'http', apiName: 'readFile' })).toBe(false);
    expect(matchesHook(matcher, {})).toBe(false);
  });
});

describe('registration snapshots', () => {
  it('does not retain caller-owned webhook or matcher objects', async () => {
    queueMode.mockReturnValue(false);
    safeFetch.mockReset().mockImplementation(async () => new Response('{}'));
    const dispatcher = new HookDispatcher();
    const source: AgentHook = {
      id: 'snapshot',
      type: 'beforeToolCall',
      matcher: { identifier: '^fs$' },
      webhook: { url: 'https://example.com/original', headers: { 'X-Version': 'original' } },
    };
    dispatcher.register('op', [source]);
    source.matcher!.identifier = '^other$';
    source.webhook!.url = 'https://example.com/changed';
    source.webhook!.headers!['X-Version'] = 'changed';
    await dispatcher.dispatch('op', 'beforeToolCall', {
      apiName: 'read',
      args: {},
      callIndex: 0,
      identifier: 'fs',
      operationId: 'op',
      stepIndex: 0,
    });
    expect(safeFetch.mock.calls[0][0]).toBe('https://example.com/original');
    expect(safeFetch.mock.calls[0][1].headers['x-version']).toBe('original');
  });
});
