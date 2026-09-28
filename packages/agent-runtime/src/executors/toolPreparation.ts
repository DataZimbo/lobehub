import type { ChatToolPayload } from '@lobechat/types';

import type { AgentRuntimeHost, ToolCallPreparation, ToolRunContext } from '../transport';
import type { AgentRuntimeContext, AgentState, RuntimeConfig } from '../types';
import { extractActivatedSkillsFromMessages, extractTodosFromMessages } from '../utils';
import { selectToolManifestMap, selectToolSourceMap } from '../utils/operationToolSet';

const toolNameOf = (tool: ChatToolPayload) => `${tool.identifier}/${tool.apiName}`;

export const resolveToolSource = (state: AgentState, tool: ChatToolPayload): string | undefined =>
  selectToolSourceMap(state)[tool.identifier];

const parseToolArgs = (tool: ChatToolPayload): Record<string, unknown> => {
  try {
    if (typeof tool.arguments === 'string') {
      const parsed = JSON.parse(tool.arguments) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    }

    return tool.arguments && typeof tool.arguments === 'object'
      ? (tool.arguments as Record<string, unknown>)
      : {};
  } catch {
    // Execution still receives the raw arguments; this preview is only for hooks.
    return {};
  }
};

export const buildEffectiveManifestMap = (state: AgentState): Record<string, any> => ({
  ...selectToolManifestMap(state),
  ...Object.fromEntries(
    (state.activatedStepTools ?? [])
      .filter((activation) => activation.manifest)
      .map((activation) => [activation.id, activation.manifest!]),
  ),
});

const resolveCallIndex = (state: AgentState, toolName: string) => {
  const existingToolStats = state.usage?.tools?.byTool?.find((tool) => tool.name === toolName);
  return (existingToolStats?.calls ?? 0) + 1;
};

export const createRunContext = ({
  host,
  mode,
  parentMessageId,
  reuseExistingMessage,
  state,
  stepContext,
  tool,
  toolMessageId,
}: {
  host: AgentRuntimeHost;
  mode: ToolRunContext['mode'];
  parentMessageId: string;
  reuseExistingMessage?: boolean;
  state: AgentState;
  stepContext?: AgentRuntimeContext['stepContext'];
  tool: ChatToolPayload;
  toolMessageId?: string;
}): ToolRunContext => {
  const toolName = toolNameOf(tool);
  const toolSource = resolveToolSource(state, tool);
  const agentConfig = state.world?.agent as
    { chatConfig?: { toolResultMaxLength?: number } } | undefined;

  return {
    abortSignal: host.operation.abortSignal,
    activatedSkills: extractActivatedSkillsFromMessages(state.messages),
    agentId: host.operation.agentId ?? state.origin?.agentId,
    assistantMessageId: parentMessageId,
    callIndex: resolveCallIndex(state, toolName),
    // Todo state is reconstructed from message history for the same reason the
    // prompt side does it (`serverCallLlmContextBuilder`): the plan document is
    // a best-effort mirror that only exists once `createPlan` has run, so the
    // tool-execution side must not treat it as the source of truth.
    currentTodos: extractTodosFromMessages(state.messages)?.items,
    effectiveManifestMap: buildEffectiveManifestMap(state),
    groupId: host.operation.groupId ?? state.origin?.groupId,
    messageId: state.origin?.sourceMessageId,
    mode,
    operationId: host.operation.operationId,
    parentMessageId,
    parsedArgs: parseToolArgs(tool),
    reuseExistingMessage,
    state,
    stepIndex: host.operation.stepIndex,
    stepContext,
    threadId: host.operation.threadId ?? state.origin?.threadId,
    toolMessageId,
    toolName,
    toolResultMaxLength: agentConfig?.chatConfig?.toolResultMaxLength,
    toolSource,
    topicId: host.operation.topicId ?? state.origin?.topicId,
    workspaceId: state.origin?.workspaceId ?? host.operation.workspaceId,
  };
};

/** Shared by the decision boundary and direct single/batch executors. No mock or tool IO. */
export async function prepareToolCalls(
  host: AgentRuntimeHost,
  state: AgentState,
  calls: ChatToolPayload[],
  parentMessageId: string,
  stepContext?: AgentRuntimeContext['stepContext'],
): Promise<void> {
  if (!host.transports.tools?.prepare) return;
  // Providers can reuse native ids in a later assistant turn.
  if (state.toolPreparationParentId !== parentMessageId) {
    state.toolPreparations = {};
    state.toolPreparationParentId = parentMessageId;
  }
  state.toolPreparations ??= {};
  for (const tool of calls) {
    if (state.toolPreparations[tool.id]) continue;
    const context = createRunContext({
      host,
      mode: calls.length > 1 ? 'batch' : 'single',
      parentMessageId,
      state,
      stepContext,
      tool,
    });
    const signal = context.abortSignal;
    const cancelled: ToolCallPreparation = {
      originalArgs: state.toolPreparations?.[tool.id]?.originalArgs ?? context.parsedArgs,
      status: 'cancelled',
    };
    const preparation = signal?.aborted
      ? cancelled
      : await new Promise<ToolCallPreparation>((resolve, reject) => {
          const onAbort = () => resolve(cancelled);
          signal?.addEventListener('abort', onAbort, { once: true });
          Promise.resolve()
            .then(() =>
              signal?.aborted ? cancelled : host.transports.tools!.prepare!(tool, context),
            )
            .then(resolve, reject)
            .finally(() => signal?.removeEventListener('abort', onAbort));
          if (signal?.aborted) onAbort();
        });
    state.toolPreparations[tool.id] = signal?.aborted ? cancelled : preparation;
    if (
      host.operation.abortSignal?.aborted ||
      state.toolPreparations[tool.id].status === 'cancelled'
    ) {
      state.status = 'interrupted';
      break;
    }
  }
}

export const createToolPreparation =
  (host: AgentRuntimeHost): NonNullable<RuntimeConfig['prepareTools']> =>
  async (context, state) => {
    if (state.status === 'interrupted') return;
    if (context.phase !== 'llm_result' && context.phase !== 'human_approved_tool') return;
    const payload = context.payload as {
      toolsCalling?: ChatToolPayload[];
      approvedToolCall?: ChatToolPayload;
      approvedToolCalls?: ChatToolPayload[];
      parentMessageId: string;
    };
    const calls =
      payload.toolsCalling ??
      payload.approvedToolCalls ??
      (payload.approvedToolCall ? [payload.approvedToolCall] : []);
    // Approval is a new control check; C2 owns original-input rewrites and approval invalidation.
    if (context.phase === 'human_approved_tool') {
      for (const call of calls) delete state.toolPreparations?.[call.id];
    }
    await prepareToolCalls(host, state, calls, payload.parentMessageId, context.stepContext);
  };
