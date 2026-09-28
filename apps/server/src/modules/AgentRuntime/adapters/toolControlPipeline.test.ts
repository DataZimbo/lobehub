import type { AgentRuntimeHost, AgentState, ToolCallHookEvent } from '@lobechat/agent-runtime';
import {
  AgentRuntime,
  createAgentRuntimeExecutors,
  createToolPreparation,
  GeneralChatAgent,
} from '@lobechat/agent-runtime';
import type { ChatToolPayload } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentHook } from '@/server/services/agentRuntime/hooks';
import { HookDispatcher } from '@/server/services/agentRuntime/hooks';

import type { RuntimeExecutorContext } from '../context';
import { ServerToolTransport } from './ServerToolTransport';

const { fetchHook, queueMode } = vi.hoisted(() => ({ fetchHook: vi.fn(), queueMode: vi.fn() }));
vi.mock('@lobechat/ssrf-safe-fetch', () => ({ ssrfSafeFetch: fetchHook }));
vi.mock('@/server/services/queue/impls', () => ({ isQueueAgentRuntimeEnabled: queueMode }));
vi.mock('@/libs/qstash', () => ({ OtelQstashClient: class {} }));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentVisibility = async () => 'private';
  },
}));
vi.mock('../executorHelpers', () => ({
  archiveRuntimeToolResult: async (result: unknown) => result,
  buildServerAgentMemberRunner: () => undefined,
  buildServerVirtualSubAgentRunner: () => undefined,
  GEN_AI_FUNCTION_TOOL_TYPE: 'function',
  isOperationInterrupted: async () => false,
  log: () => {},
  registerWorkFromIntent: vi.fn(),
  TOOL_MAX_RETRIES: 2,
  TOOL_PRICING: { 'fs/write': 5 },
}));

const call = (id = 'native-1'): ChatToolPayload => ({
  id,
  apiName: 'write',
  identifier: 'fs',
  arguments: '{"path":"a"}',
  type: 'builtin',
});
const control = (id = 'control', onError: 'continue' | 'block' = 'continue'): AgentHook => ({
  id,
  type: 'beforeToolCall',
  webhook: { url: `https://hooks.example/${id}`, responseHandling: 'toolCall', onError },
});
const response = (permissionDecision: 'allow' | 'deny') =>
  new Response(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'beforeToolCall', permissionDecision },
    }),
  );

function setup(hooks: AgentHook[], signal?: AbortSignal, restore = false) {
  const registered = new HookDispatcher();
  registered.register('op', hooks);
  const dispatcher = restore ? new HookDispatcher() : registered;
  const execute = vi.fn().mockResolvedValue({ content: 'executed', success: true });
  const rows: Record<string, unknown>[] = [];
  const state: AgentState = {
    cost: {
      calculatedAt: '',
      currency: 'USD',
      llm: { byModel: [], currency: 'USD', total: 0 },
      tools: { byTool: [], currency: 'USD', total: 0 },
      total: 0,
    },
    usage: {
      humanInteraction: {
        approvalRequests: 0,
        promptRequests: 0,
        selectRequests: 0,
        totalWaitingTimeMs: 0,
      },
      llm: { apiCalls: 0, processingTimeMs: 0, tokens: { input: 0, output: 0, total: 0 } },
      tools: { byTool: [], totalCalls: 0, totalTimeMs: 0 },
    },
    createdAt: '',
    lastModified: '',
    messages: [],
    operationId: 'op',
    status: 'running',
    stepCount: 0,
    origin: { agentId: 'agent', topicId: 'topic' },
    // Serialize to model a worker boundary, not merely an in-memory clone.
    // eslint-disable-next-line unicorn/prefer-structured-clone
    host: { hooks: JSON.parse(JSON.stringify(registered.getSerializedHooks('op') ?? [])) },
    userInterventionConfig: { approvalMode: 'auto-run' },
  };
  const transport = new ServerToolTransport({
    operationId: 'op',
    stepIndex: 1,
    userId: 'user',
    hookDispatcher: dispatcher,
    abortSignal: signal,
    serverDB: {},
    streamManager: {},
    toolExecutionService: { executeTool: execute },
  } as unknown as RuntimeExecutorContext);
  const host: AgentRuntimeHost = {
    operation: { operationId: 'op', stepIndex: 1, agentId: 'agent', abortSignal: signal },
    transports: {
      tools: transport,
      messages: {
        createToolMessage: vi.fn(async (row) => {
          rows.push(row);
          return { ...row, id: `row-${rows.length}` };
        }),
        query: vi.fn(async () => rows),
        updateToolMessage: vi.fn(),
        updateToolIntervention: vi.fn(),
        update: vi.fn(),
        findToolMessageIdByToolCallId: vi.fn(),
      } as unknown as AgentRuntimeHost['transports']['messages'],
      stream: { publishEvent: vi.fn(), publishChunk: vi.fn() },
    },
  };
  const executors = createAgentRuntimeExecutors(host);
  const runtime = new AgentRuntime(new GeneralChatAgent({ operationId: 'op' }), {
    executors,
    prepareTools: createToolPreparation(host),
  });
  const step = (calls = [call()]) =>
    runtime.step(state, {
      phase: 'llm_result',
      payload: { hasToolsCalling: true, parentMessageId: 'assistant', toolsCalling: calls },
    });
  return { dispatcher, execute, executors, host, rows, runtime, state, step };
}

beforeEach(() => {
  fetchHook.mockReset().mockImplementation(async () => response('allow'));
  queueMode.mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe('beforeToolCall control pipeline', () => {
  it.each([false, true])(
    'uses the persisted share visitor for hook identity while executing as the owner, queue=%s',
    async (queue) => {
      queueMode.mockReturnValue(queue);
      const fixture = setup(
        [
          control(),
          {
            id: 'after',
            type: 'afterToolCall',
            webhook: { url: 'https://hooks.example/after' },
          },
        ],
        undefined,
        queue,
      );
      fixture.state.origin!.userId = 'origin-owner';
      fixture.state.principal = {
        actor: {
          shareVisitor: {
            agentId: 'agent',
            shareId: 'share-1',
            visitorUserId: 'visitor-1',
          },
        },
      };
      // Restore the trusted state through its persistence wire format.
      // eslint-disable-next-line unicorn/prefer-structured-clone
      Object.assign(fixture.state, JSON.parse(JSON.stringify(fixture.state)));

      await fixture.step([{ ...call(), arguments: '{"path":"a","userId":"untrusted-input"}' }]);

      expect(fetchHook).toHaveBeenCalledTimes(2);
      for (const [, request] of fetchHook.mock.calls) {
        expect(JSON.parse(request.body)).toMatchObject({
          userId: 'visitor-1',
          args: { userId: 'untrusted-input' },
        });
      }
      expect(fixture.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user' }),
      );
      expect(fixture.state.origin?.userId).toBe('origin-owner');
    },
  );

  it.each([false, true])(
    'denies before approval/mock/execution and persists attempts=0, queue=%s',
    async (queue) => {
      queueMode.mockReturnValue(queue);
      fetchHook.mockImplementation(async () => response('deny'));
      const mock = vi.fn(async (event) => {
        (event as ToolCallHookEvent).mock({ content: 'mock', success: true });
      });
      const after = vi.fn();
      const fixture = setup(
        [
          control(),
          { id: 'mock', type: 'beforeToolCall', handler: mock },
          { id: 'after', type: 'afterToolCall', handler: after },
        ],
        undefined,
        queue,
      );
      fixture.state.userInterventionConfig = { approvalMode: 'manual' };
      const result = await fixture.step();
      expect(result.newState.status).toBe('running');
      expect(fixture.execute).not.toHaveBeenCalled();
      expect(mock).not.toHaveBeenCalled();
      expect(fixture.rows).toEqual([
        expect.objectContaining({
          pluginState: { reason: 'hook_denied', type: 'blocked' },
          tool_call_id: 'native-1',
        }),
      ]);
      expect(fixture.host.transports.stream.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_end',
          data: expect.objectContaining({
            attempts: 0,
            result: expect.objectContaining({ success: false }),
          }),
        }),
      );
      expect(result.newState.cost?.total ?? 0).toBe(0);
      expect(fetchHook).toHaveBeenCalledTimes(1);
      if (!queue)
        expect(after).toHaveBeenCalledWith(
          expect.objectContaining({
            mocked: false,
            success: false,
            result: expect.objectContaining({ state: { reason: 'hook_denied', type: 'blocked' } }),
          }),
        );
    },
  );

  it('allow still requires product approval', async () => {
    const fixture = setup([control()]);
    fixture.state.userInterventionConfig = { approvalMode: 'manual' };
    const result = await fixture.step();
    expect(result.newState.status).toBe('waiting_for_human');
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fetchHook).toHaveBeenCalledTimes(1);
  });

  it('allow does not bypass the product tool allow-list', async () => {
    const fixture = setup([control()]);
    const runtime = new AgentRuntime(
      new GeneralChatAgent({ operationId: 'op', allowedToolNames: ['other/tool'] }),
      {
        executors: fixture.executors,
        prepareTools: createToolPreparation(fixture.host),
      },
    );
    const result = await runtime.step(fixture.state, {
      phase: 'llm_result',
      payload: { hasToolsCalling: true, toolsCalling: [call()], parentMessageId: 'assistant' },
    });
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool_result',
        result: expect.objectContaining({ state: { reason: 'tool_not_allowed', type: 'blocked' } }),
      }),
    );
  });

  it('applies ordered controls and stops at deny, before observers', async () => {
    fetchHook.mockResolvedValueOnce(response('allow')).mockResolvedValueOnce(response('deny'));
    const observer = vi.fn();
    const fixture = setup([
      { id: 'observer', type: 'beforeToolCall', handler: observer },
      control('one'),
      control('two'),
      control('three'),
    ]);
    await fixture.step();
    expect(fetchHook.mock.calls.map(([url]) => url)).toEqual([
      'https://hooks.example/one',
      'https://hooks.example/two',
    ]);
    expect(observer).not.toHaveBeenCalled();
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(JSON.parse(fetchHook.mock.calls[0][1].body)).toMatchObject({
      toolCallId: 'native-1',
      args: { path: 'a' },
      originalArgs: { path: 'a' },
    });
  });

  it('prepares the whole batch before any lane starts and only blocks its denied member', async () => {
    const order: string[] = [];
    fetchHook.mockImplementation(async (_url, init) => {
      const id = JSON.parse(init.body).toolCallId;
      order.push(id);
      return response(id === 'native-2' ? 'deny' : 'allow');
    });
    const fixture = setup([control()]);
    fixture.execute.mockImplementation(async () => {
      order.push('execute');
      return { content: 'ok', success: true };
    });
    const result = await fixture.executors.call_tools_batch!(
      {
        type: 'call_tools_batch',
        payload: {
          parentMessageId: 'assistant',
          toolsCalling: [call(), call('native-2'), call('native-3')],
        },
      },
      fixture.state,
    );
    expect(order.slice(0, 3)).toEqual(['native-1', 'native-2', 'native-3']);
    expect(fixture.execute).toHaveBeenCalledTimes(2);
    expect(result.events.filter((event) => event.type === 'tool_result')).toHaveLength(3);
    expect(result.newState.cost?.total).toBe(10);
  });

  it.each([false, true])(
    'delivers observe/mock once and webhook-only in queue=%s',
    async (queue) => {
      queueMode.mockReturnValue(queue);
      const handler = vi.fn();
      const fixture = setup([
        control(),
        {
          id: 'dual',
          type: 'beforeToolCall',
          handler,
          webhook: { url: 'https://hooks.example/dual' },
        },
        { id: 'http', type: 'beforeToolCall', webhook: { url: 'https://hooks.example/http' } },
      ]);
      await fixture.step();
      expect(handler).toHaveBeenCalledTimes(queue ? 0 : 1);
      expect(fetchHook.mock.calls.map(([url]) => url)).toEqual(
        queue
          ? [
              'https://hooks.example/control',
              'https://hooks.example/dual',
              'https://hooks.example/http',
            ]
          : ['https://hooks.example/control', 'https://hooks.example/http'],
      );
      expect(fixture.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('runs an in-memory mock once after control and skips real effects', async () => {
    const handler = vi.fn(async (event) => {
      (event as ToolCallHookEvent).mock({ content: 'mock', success: true });
    });
    const fixture = setup([control(), { id: 'mock', type: 'beforeToolCall', handler }]);
    const result = await fixture.step();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'tool_result',
        result: expect.objectContaining({ content: 'mock' }),
      }),
    );
  });

  it('reuses preparation across internal tool retries', async () => {
    const handler = vi.fn();
    const fixture = setup([control(), { id: 'observe', type: 'beforeToolCall', handler }]);
    fixture.execute.mockResolvedValueOnce({
      content: '',
      success: false,
      error: { kind: 'retry' },
    });
    await fixture.step();
    expect(fixture.execute).toHaveBeenCalledTimes(2);
    expect(fetchHook).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('aborts waiting for an uncooperative webhook and a late allow cannot launch', async () => {
    let release!: (value: Response) => void;
    fetchHook.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const abort = new AbortController();
    const fixture = setup([control()], abort.signal);
    const pending = fixture.step();
    await vi.waitFor(() => expect(fetchHook).toHaveBeenCalledTimes(1));
    abort.abort();
    const result = await pending;
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(result.events.some((event) => event.type === 'done')).toBe(true);
    release(response('allow'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it.each(['updatedInput', 'additionalContext'] as const)(
    'routes unsupported %s through onError',
    async (field) => {
      fetchHook.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'beforeToolCall',
                permissionDecision: 'allow',
                [field]: field === 'updatedInput' ? { path: 'b' } : 'context',
              },
            }),
          ),
      );
      const blocked = setup([control('block', 'block')]);
      await blocked.step();
      expect(blocked.execute).not.toHaveBeenCalled();
      expect(blocked.rows[0].content).toBe('unsupported_control_response');
      const continued = setup([control()]);
      await continued.step();
      expect(continued.execute).toHaveBeenCalledTimes(1);
      expect(continued.execute.mock.calls[0][0].arguments).toBe('{"path":"a"}');
    },
  );

  it('rechecks controls on human_approved_tool without using the old allow', async () => {
    const fixture = setup([control()]);
    fixture.state.toolPreparationParentId = 'assistant';
    fixture.state.toolPreparations = {
      'native-1': { status: 'ready', originalArgs: { path: 'a' } },
    };
    fetchHook.mockImplementation(async () => response('deny'));
    await fixture.runtime.step(fixture.state, {
      phase: 'human_approved_tool',
      payload: { approvedToolCall: call(), parentMessageId: 'assistant' },
    });
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.rows[0].pluginState).toEqual({ reason: 'hook_denied', type: 'blocked' });
  });
  it.each(['single', 'batch'] as const)(
    'does not forward a denied client tool in %s mode',
    async (mode) => {
      fetchHook.mockImplementation(async () => response('deny'));
      const fixture = setup([control()]);
      const clientCall = { ...call(), executor: 'client' as const };
      const result =
        mode === 'single'
          ? await fixture.executors.call_tool!(
              {
                type: 'call_tool',
                payload: { parentMessageId: 'assistant', toolCalling: clientCall },
              },
              fixture.state,
            )
          : await fixture.executors.call_tools_batch!(
              {
                type: 'call_tools_batch',
                payload: { parentMessageId: 'assistant', toolsCalling: [clientCall] },
              },
              fixture.state,
            );
      expect(fixture.execute).not.toHaveBeenCalled();
      expect(result.newState.status).toBe('running');
      expect(fixture.rows[0].pluginState).toEqual({ reason: 'hook_denied', type: 'blocked' });
    },
  );

  it.each(['continue', 'block'] as const)(
    'applies onError=%s to a timed-out control without retry',
    async (policy) => {
      fetchHook.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(new DOMException('timeout', 'AbortError')),
              { once: true },
            );
          }),
      );
      const hook = control('timeout', policy);
      hook.webhook!.timeout = 0.001;
      const fixture = setup([hook]);
      await fixture.step();
      expect(fetchHook).toHaveBeenCalledTimes(1);
      expect(fixture.execute).toHaveBeenCalledTimes(policy === 'block' ? 0 : 1);
    },
  );

  it('does not reuse a native call id from a previous assistant turn', async () => {
    const fixture = setup([control()]);
    fixture.state.toolPreparationParentId = 'old-assistant';
    fixture.state.toolPreparations = { 'native-1': { originalArgs: {}, status: 'ready' } };
    fetchHook.mockImplementation(async () => response('deny'));
    await fixture.step();
    expect(fetchHook).toHaveBeenCalledTimes(1);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('retains critical webhook failure after a local mock', async () => {
    fetchHook.mockRejectedValue(new Error('network unavailable'));
    const fixture = setup([
      {
        id: 'mock',
        type: 'beforeToolCall',
        handler: async (event) => {
          (event as ToolCallHookEvent).mock({ content: 'mock', success: true });
        },
      },
      {
        id: 'critical',
        type: 'beforeToolCall',
        webhook: { url: 'https://hooks.example/critical', fallback: 'none' },
      },
    ]);
    const result = await fixture.step();
    expect(fetchHook).toHaveBeenCalledTimes(1);
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'error' }));
    expect(fixture.rows).toHaveLength(0);
  });
  it('settles an already-approved row when the refreshed control denies it', async () => {
    const fixture = setup([control()]);
    fetchHook.mockImplementation(async () => response('deny'));
    const result = await fixture.runtime.step(fixture.state, {
      phase: 'human_approved_tool',
      payload: {
        approvedToolCall: call(),
        parentMessageId: 'pending-tool-row',
        skipCreateToolMessage: true,
      },
    });
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.rows).toHaveLength(0);
    expect(fixture.host.transports.messages.updateToolMessage).toHaveBeenCalledWith(
      'pending-tool-row',
      expect.objectContaining({ pluginState: { reason: 'hook_denied', type: 'blocked' } }),
    );
    expect(fixture.host.transports.messages.updateToolIntervention).toHaveBeenCalledWith(
      'pending-tool-row',
      { rejectedReason: 'hook_denied', status: 'rejected' },
    );
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'tool_result' }));
  });
});
