import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardService } from '@/services/dashboard';

import { DashboardApiName } from '../../types';
import { dashboardExecutor } from './index';

vi.mock('@/services/dashboard', () => ({
  dashboardService: { runAgentTool: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(dashboardService.runAgentTool).mockReset();
});

describe('dashboardExecutor', () => {
  it('exposes every API', () => {
    for (const api of Object.values(DashboardApiName))
      expect(dashboardExecutor.hasApi(api)).toBe(true);
  });

  it('runs the call server-side with the conversation context', async () => {
    vi.mocked(dashboardService.runAgentTool).mockResolvedValue({
      content: 'Dry run succeeded',
      state: { runId: 'r1' },
      success: true,
    });

    const result = await dashboardExecutor.invoke(
      DashboardApiName.dryRunWidget,
      { widgetId: 'w1' },
      { agentId: 'agt_1', messageId: 'msg_1', operationId: 'op_1', topicId: 'tpc_1' },
    );

    expect(dashboardService.runAgentTool).toHaveBeenCalledWith(
      'dryRunWidget',
      { widgetId: 'w1' },
      { agentId: 'agt_1', messageId: 'msg_1', operationId: 'op_1', topicId: 'tpc_1' },
    );
    expect(result).toEqual({ content: 'Dry run succeeded', state: { runId: 'r1' }, success: true });
  });

  it('keeps content and state on a refused call', async () => {
    vi.mocked(dashboardService.runAgentTool).mockResolvedValue({
      content: 'Failed to publish widget: dry-run it first',
      error: { message: 'dry-run it first' },
      success: false,
    });

    const result = await dashboardExecutor.invoke(
      DashboardApiName.requestPublish,
      { widgetId: 'w1' },
      { messageId: 'msg_1' },
    );

    expect(result).toMatchObject({
      content: 'Failed to publish widget: dry-run it first',
      error: { message: 'dry-run it first', type: 'PluginServerError' },
      success: false,
    });
  });

  it('turns a transport failure into a readable result', async () => {
    vi.mocked(dashboardService.runAgentTool).mockRejectedValue(new Error('UNAUTHORIZED'));
    const result = await dashboardExecutor.invoke(
      DashboardApiName.listDashboards,
      {},
      { messageId: 'msg_1' },
    );
    expect(result).toMatchObject({
      content: 'Failed to run listDashboards: UNAUTHORIZED',
      success: false,
    });
  });
});
