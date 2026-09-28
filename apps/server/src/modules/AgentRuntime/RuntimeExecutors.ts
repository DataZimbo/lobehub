import type { AgentInstruction, InstructionExecutor } from '@lobechat/agent-runtime';
import { createAgentRuntimeExecutors, createToolPreparation } from '@lobechat/agent-runtime';

import { buildHost } from './buildHost';
import type { RuntimeExecutorContext } from './context';

export { type RuntimeExecutorContext } from './context';

export const createRuntimeExecutors = (
  ctx: RuntimeExecutorContext,
): Partial<Record<AgentInstruction['type'], InstructionExecutor>> => {
  return createAgentRuntimeExecutors(buildHost(ctx));
};

export const createRuntimeToolPreparation = (ctx: RuntimeExecutorContext) =>
  createToolPreparation(buildHost(ctx));
