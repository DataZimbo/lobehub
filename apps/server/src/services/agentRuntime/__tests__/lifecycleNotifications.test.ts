// @vitest-environment node
/** Real step/completion producers through the dispatcher and HTTP transport. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isQueueAgentRuntimeEnabled } from '@/server/services/queue/impls';

import { AgentRuntimeService } from '../AgentRuntimeService';
import { CriticalHookDeliveryError, hookDispatcher } from '../hooks';
import type { AgentHookEvent } from '../hooks/types';

// ── Mocks ──────────────────────────────────────────
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'http://localhost:3010' } }));
vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));
vi.mock('@/server/modules/AgentRuntime', () => ({
  AgentRuntimeCoordinator: vi.fn().mockImplementation(function () {
    return {
      createAgentOperation: vi.fn(),
      getOperationMetadata: vi.fn(),
      isInterrupted: vi.fn().mockResolvedValue(false),
      hasQueuedMessages: vi.fn().mockResolvedValue(false),
      loadAgentState: vi.fn(),
      releaseStepLock: vi.fn().mockResolvedValue(undefined),
      saveAgentState: vi.fn(),
      saveStepResult: vi.fn(),
      tryClaimStep: vi.fn().mockResolvedValue(true),
    };
  }),
  createStreamEventManager: vi.fn(function () {
    return {
      cleanupOperation: vi.fn(),
      publishAgentRuntimeEnd: vi.fn(),
      publishAgentRuntimeInit: vi.fn(),
      publishStreamEvent: vi.fn(),
    };
  }),
}));
vi.mock('@/server/modules/AgentRuntime/RuntimeExecutors', () => ({
  createRuntimeExecutors: vi.fn(function () {
    return {};
  }),
}));
vi.mock('@/server/services/mcp', () => ({ mcpService: {} }));
vi.mock('@/server/services/queue', () => ({
  QueueService: vi.fn().mockImplementation(function () {
    return {
      getImpl: vi.fn(function () {
        return {};
      }),
      scheduleMessage: vi.fn(),
    };
  }),
}));
vi.mock('@/server/services/queue/impls', () => ({
  LocalQueueServiceImpl: class {},
  isQueueAgentRuntimeEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('@/server/services/toolExecution', () => ({
  ToolExecutionService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));
vi.mock('@/server/services/toolExecution/builtin', () => ({
  BuiltinToolsExecutor: vi.fn().mockImplementation(function () {
    return {};
  }),
}));
vi.mock('@lobechat/builtin-tools/dynamicInterventionAudits', () => ({
  dynamicInterventionAudits: [],
}));

const { safeFetch, publish } = vi.hoisted(() => ({ safeFetch: vi.fn(), publish: vi.fn() }));
vi.mock('@lobechat/ssrf-safe-fetch', () => ({ ssrfSafeFetch: safeFetch }));
vi.mock('@/libs/qstash', () => ({
  OtelQstashClient: class {
    publishJSON = publish;
  },
}));
vi.mock('@/server/services/agentSignal', () => ({ emitAgentSignalSourceEvent: vi.fn() }));
vi.mock('@/server/services/verify', () => ({
  instantiateVerifyPlanOnStart: vi.fn(),
  runVerifyOnCompletion: vi.fn(),
  settleFailedRepair: vi.fn(),
}));

const operationId = 'lifecycle-operation';
const origin = {
  agentId: 'agent-1',
  userId: 'user-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  lineage: {
    parentOperationId: 'parent-1',
    isSubAgent: true as const,
    orchestrationRole: 'member' as const,
  },
};
const events = ['beforeStep', 'afterStep', 'onComplete', 'onError'] as const;
const usage = {
  llm: { apiCalls: 2, tokens: { input: 40, output: 10, total: 50 } },
  tools: { totalCalls: 1 },
};
const makeState = () => ({
  operationId,
  origin,
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  cost: { total: 0.02 },
  usage,
  status: 'running',
  stepCount: 1,
  messages: [
    { role: 'assistant', content: 'Final reply ![image](https://example.com/result.png)' },
  ],
  metadata: { _stepTracking: { totalToolCalls: 7, lastLLMContent: 'Previous reply' } },
  host: {
    hooks: events.map((type) => ({
      id: type,
      type,
      webhook: { url: 'https://example.com/hooks' },
    })),
  },
});
const setup = (state = makeState()) => {
  const service = new AgentRuntimeService({} as any, 'user-1', { queueService: null });
  const coordinator = (service as any).coordinator;
  coordinator.loadAgentState.mockResolvedValue(state);
  const newState = { ...state, status: 'done', stepCount: 2 };
  const step = vi.fn().mockResolvedValue({
    events: [{ type: 'done', reason: 'done' }],
    newState,
    nextContext: null,
  });
  vi.spyOn(service as any, 'createAgentRuntime').mockReturnValue({ runtime: { step } });
  // DB persistence is external to hook delivery; keep the real lifecycle producer.
  vi.spyOn((service as any).completionLifecycle, 'persistCompletion').mockResolvedValue(true);
  vi.spyOn((service as any).completionLifecycle, 'registerFileWorks').mockResolvedValue(undefined);
  return { service, coordinator, step, newState };
};
const execute = (service: AgentRuntimeService) =>
  service.executeStep({
    context: { phase: 'user_input' } as any,
    operationId,
    stepIndex: 1,
  });
const httpEvents = () => safeFetch.mock.calls.map(([, request]) => JSON.parse(request.body));

beforeEach(() => {
  vi.mocked(isQueueAgentRuntimeEnabled).mockReturnValue(false);
  safeFetch.mockReset().mockImplementation(async () => new Response('{}'));
  publish.mockReset().mockResolvedValue({ messageId: 'queued' });
});
afterEach(() => {
  hookDispatcher.unregister(operationId);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('lifecycle notifications from executeStep', () => {
  it.each([false, true])('uses persisted hooks on a fresh worker (queue=%s)', async (queue) => {
    vi.mocked(isQueueAgentRuntimeEnabled).mockReturnValue(queue);
    const { service, step, newState } = setup();
    const result = await execute(service);
    expect(result.success).toBe(true);
    expect(step).toHaveBeenCalledTimes(1);
    const delivered = httpEvents();
    expect(delivered.map((event) => event.hookType)).toEqual([
      'beforeStep',
      'afterStep',
      'onComplete',
    ]);
    for (const event of delivered) {
      expect(event).toMatchObject({ ...origin, operationId, parentOperationId: 'parent-1' });
      expect(event).not.toHaveProperty('finalState');
      expect(event).not.toHaveProperty('rootOperationId');
    }
    expect(delivered[0]).toMatchObject({ stepIndex: 1, steps: 1 });
    expect(delivered[1]).toMatchObject({
      stepIndex: 1,
      steps: 2,
      totalSteps: 2,
      totalCost: newState.cost.total,
      totalTokens: 50,
      totalInputTokens: 40,
      totalOutputTokens: 10,
      totalToolCalls: 1,
      lastLLMContent: 'Previous reply',
      shouldContinue: false,
    });
    expect(delivered[2]).toMatchObject({
      reason: 'done',
      status: 'done',
      steps: 2,
      cost: 0.02,
      toolCalls: 1,
      llmCalls: 2,
      totalCost: 0.02,
      totalSteps: 2,
      totalToolCalls: 1,
      totalTokens: 50,
      totalInputTokens: 40,
      totalOutputTokens: 10,
      lastAssistantContent: newState.messages[0].content,
      attachments: [{ fetchUrl: 'https://example.com/result.png', type: 'image' }],
    });
  });

  it('delivers QStash notifications using persisted hooks without local registration', async () => {
    vi.mocked(isQueueAgentRuntimeEnabled).mockReturnValue(true);
    vi.stubEnv('QSTASH_TOKEN', 'test-token');
    const state = makeState();
    const hooks = state.host.hooks.map((hook) => ({
      ...hook,
      webhook: { ...hook.webhook, delivery: 'qstash' as const },
    }));
    const { service } = setup({ ...state, host: { hooks } });
    await execute(service);
    expect(safeFetch).not.toHaveBeenCalled();
    const delivered = publish.mock.calls.map(([request]) => request.body);
    expect(delivered.map((event) => event.hookType)).toEqual([
      'beforeStep',
      'afterStep',
      'onComplete',
    ]);
    expect(delivered[2]).toMatchObject({ operationId, threadId: 'thread-1', totalToolCalls: 1 });
    expect(delivered[2]).not.toHaveProperty('finalState');
  });

  it('keeps handler-only progress statistics equal to executed usage and retains local state', async () => {
    const state = makeState();
    state.host.hooks = [];
    const captured: AgentHookEvent[] = [];
    hookDispatcher.register(
      operationId,
      events.map((type) => ({
        id: type,
        type,
        handler: async (event) => {
          captured.push(event);
        },
      })),
    );
    const { service } = setup(state);
    await execute(service);
    expect(captured).toHaveLength(3);
    expect(captured[1].totalToolCalls).toBe(1);
    expect(captured[2].totalToolCalls).toBe(1);
    expect(captured.every((event) => event.finalState !== undefined)).toBe(true);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('retains the structured runtime error and correlation in the existing complete/error pair', async () => {
    const error = {
      type: 'ProviderFailure',
      message: 'provider unavailable',
      body: { code: 'upstream', retryAfter: 3 },
    };
    const { service, newState, step } = setup();
    step.mockResolvedValue({
      events: [{ type: 'done', reason: 'error' }],
      newState: { ...newState, status: 'error', error },
      nextContext: null,
    });
    await execute(service);
    const terminal = httpEvents().filter((event) =>
      ['onComplete', 'onError'].includes(event.hookType),
    );
    expect(terminal.map((event) => event.hookType)).toEqual(['onComplete', 'onError']);
    for (const event of terminal)
      expect(event).toMatchObject({
        errorDetail: error,
        reason: 'error',
        operationId,
        parentOperationId: 'parent-1',
      });
  });

  it('ignores notification responses and failures without changing step execution or emitting onError', async () => {
    safeFetch
      .mockRejectedValueOnce(new Error('notification failed'))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } })),
      );
    const { service, step } = setup();
    expect((await execute(service)).success).toBe(true);
    expect(step).toHaveBeenCalledTimes(1);
    expect(httpEvents().map((event) => event.hookType)).toEqual([
      'beforeStep',
      'afterStep',
      'onComplete',
    ]);
  });

  it('does not invent parent or root IDs when only a progress anchor exists', async () => {
    const state = makeState();
    state.origin = {
      agentId: 'agent-1',
      userId: 'user-1',
      lineage: { progressAnchor: { parentOperationId: 'progress-only', toolMessageId: 'tool' } },
    } as any;
    const { service } = setup(state);
    await execute(service);
    for (const event of httpEvents()) {
      expect(event).not.toHaveProperty('parentOperationId');
      expect(event).not.toHaveProperty('rootOperationId');
      expect(event).not.toHaveProperty('threadId');
      expect(event).not.toHaveProperty('workspaceId');
    }
  });

  it('keeps a thrown structured runtime failure in the original complete/error pair', async () => {
    const { service, step } = setup();
    step.mockRejectedValue({
      type: 'ProviderFailure',
      message: 'provider failed',
      body: { upstream: { status: 503 } },
    });
    await expect(execute(service)).rejects.toMatchObject({ message: 'provider failed' });
    expect(httpEvents().map((event) => event.hookType)).toEqual([
      'beforeStep',
      'onComplete',
      'onError',
    ]);
    expect(httpEvents()[2]).toMatchObject({
      ...origin,
      operationId,
      parentOperationId: 'parent-1',
      reason: 'error',
      errorDetail: {
        type: 'ProviderFailure',
        message: 'provider failed',
        body: { upstream: { status: 503 } },
      },
    });
  });

  it('retains loaded correlation and persisted hooks when the error-path state reload fails', async () => {
    vi.mocked(isQueueAgentRuntimeEnabled).mockReturnValue(true);
    const state = makeState();
    const { service, coordinator, step } = setup(state);
    const error = {
      type: 'ProviderFailure',
      message: 'provider failed',
      body: { code: 'upstream' },
    };
    coordinator.loadAgentState
      .mockReset()
      .mockResolvedValueOnce(state)
      .mockRejectedValue(new Error('state store unavailable'));
    step.mockRejectedValue(error);
    await expect(execute(service)).rejects.toBe(error);
    expect(httpEvents().map((event) => event.hookType)).toEqual([
      'beforeStep',
      'onComplete',
      'onError',
    ]);
    expect(httpEvents()[2]).toMatchObject({ operationId, ...origin, errorDetail: error });
  });

  it.each(['done', 'max_steps', 'cost_limit', 'interrupted', 'waiting_for_async_tool'])(
    'preserves the existing completion relationship for %s',
    async (reason) => {
      const { service, newState } = setup();
      const lifecycle = (service as any).completionLifecycle;
      await lifecycle.dispatchHooks(operationId, { ...newState, status: reason }, reason);
      expect(httpEvents().map((event) => event.hookType)).toEqual(
        reason === 'waiting_for_async_tool' ? [] : ['onComplete'],
      );
      if (reason !== 'waiting_for_async_tool')
        expect(httpEvents()[0]).toMatchObject({ reason, status: reason, totalSteps: 2 });
    },
  );

  it('propagates a critical completion delivery failure without turning it into a runtime error', async () => {
    const state = makeState();
    state.host.hooks = [
      {
        id: 'critical',
        type: 'onComplete',
        webhook: { url: 'https://example.com/hooks', fallback: 'none' },
      } as any,
    ];
    safeFetch.mockRejectedValue(new Error('critical callback unavailable'));
    const { service, coordinator } = setup(state);
    await expect(execute(service)).rejects.toBeInstanceOf(CriticalHookDeliveryError);
    expect(httpEvents().map((event) => event.hookType)).toEqual(['onComplete']);
    expect(
      coordinator.saveAgentState.mock.calls.every(([, saved]: any[]) => saved.status !== 'error'),
    ).toBe(true);
  });
});
