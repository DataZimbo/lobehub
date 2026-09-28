import type {
  BuiltinServerRuntimeOutput,
  BuiltinToolContext,
  BuiltinToolResult,
} from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';
import debug from 'debug';

import { dashboardService } from '@/services/dashboard';

import type { DashboardApiNameType } from '../../types';
import { DashboardApiName, DashboardIdentifier } from '../../types';

const log = debug('lobe-dashboard:executor');

/**
 * Client-runtime executor. Every call runs server-side through
 * `dashboard.runAgentTool` — the same `DashboardExecutionRuntime` and scoped
 * service the server agent runtime uses — so both runtimes stamp the same
 * ownership (agent / project / workspace) and draft provenance.
 */
class DashboardExecutor extends BaseExecutor<typeof DashboardApiName> {
  readonly identifier = DashboardIdentifier;
  protected readonly apiEnum = DashboardApiName;

  listDashboards = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.listDashboards, params, ctx);

  createWidgetDraft = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.createWidgetDraft, params, ctx);

  updateWidgetDraft = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.updateWidgetDraft, params, ctx);

  dryRunWidget = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.dryRunWidget, params, ctx);

  requestPublish = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.requestPublish, params, ctx);

  addWidgetToDashboard = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.addWidgetToDashboard, params, ctx);

  getWidgetRuns = (params: unknown, ctx?: BuiltinToolContext) =>
    this.run(DashboardApiName.getWidgetRuns, params, ctx);

  private run = async (
    apiName: DashboardApiNameType,
    params: unknown,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    try {
      log('%s params=%o', apiName, params);
      const output = await dashboardService.runAgentTool(apiName, params, {
        agentId: ctx?.agentId,
        messageId: ctx?.messageId,
        operationId: ctx?.operationId,
        topicId: ctx?.topicId ?? undefined,
      });
      return this.toResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Failed to run ${apiName}: ${message}`,
        error: { message, type: 'DashboardToolFailed' },
        success: false,
      };
    }
  };

  private toResult(output: BuiltinServerRuntimeOutput): BuiltinToolResult {
    const errorMessage =
      typeof output.error?.message === 'string' ? output.error.message : undefined;
    const content = output.content || errorMessage || 'Tool execution failed';
    if (!output.success) {
      return {
        content,
        error: { body: output.error, message: errorMessage ?? content, type: 'PluginServerError' },
        state: output.state,
        success: false,
      };
    }
    return { content, state: output.state, success: true };
  }
}

export const dashboardExecutor = new DashboardExecutor();
