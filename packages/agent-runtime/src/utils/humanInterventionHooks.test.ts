import { describe, expect, it } from 'vitest';

import type {
  AfterHumanInterventionHookEvent,
  BeforeHumanInterventionHookEvent,
  StopByHumanInterventionHookEvent,
} from '../types';
import {
  buildAfterHumanInterventionEvent,
  buildBeforeHumanInterventionEvent,
  buildHumanInterventionHookContext,
  buildStopByHumanInterventionEvent,
} from './humanInterventionHooks';

describe('human intervention notification payloads', () => {
  it.each(['approve', 'reject', 'rejectAndContinue'] as const)(
    'preserves every native id for batch %s',
    (action) => {
      const ids = ['native-2', 'native-1'];
      const event = buildAfterHumanInterventionEvent(
        { operationId: 'op' },
        { action, rejectionReason: 'reason', toolCallIds: ids },
      );
      ids.pop();
      expect(event).toEqual({
        action,
        operationId: 'op',
        rejectionReason: 'reason',
        toolCallId: undefined,
        toolCallIds: ['native-2', 'native-1'],
      });
    },
  );

  it('keeps the single id and copies complete stop membership', () => {
    const ids = ['native-1', 'native-2'];
    const event = buildStopByHumanInterventionEvent(
      { operationId: 'op' },
      {
        reason: 'human_rejected',
        rejectionReason: 'privacy',
        toolCallId: ids[0],
        toolCallIds: ids,
      },
    );
    ids.pop();
    expect(event).toMatchObject({
      reason: 'human_rejected',
      rejectionReason: 'privacy',
      toolCallId: 'native-1',
      toolCallIds: ['native-1', 'native-2'],
    });
  });

  it('uses the legacy single id for a singleton action or stop', () => {
    expect(
      buildAfterHumanInterventionEvent(
        { operationId: 'op' },
        { action: 'approve', toolCallIds: ['native'] },
      ).toolCallId,
    ).toBe('native');
    expect(
      buildStopByHumanInterventionEvent(
        { operationId: 'op' },
        { reason: 'human_rejected', toolCallIds: ['native'] },
      ).toolCallId,
    ).toBe('native');
  });

  it('does not manufacture parent/root identity from a continuation or source message', () => {
    const event = buildHumanInterventionHookContext(
      {
        origin: {
          continuation: {
            resolutionRequestId: 'decision',
            sourceOperationId: 'previous-run',
            sourceToolMessageIds: ['message'],
          },
          sourceMessageId: 'user-message',
        },
      },
      { operationId: 'actual-run' },
    );
    expect(event.operationId).toBe('actual-run');
    expect(event.parentOperationId).toBeUndefined();
    expect(event).not.toHaveProperty('rootOperationId');
    expect(event.assistantMessageId).toBeUndefined();
  });

  it.each(['{broken', '[]', 'null'])(
    'retains exact card arguments when no parsed record is available: %s',
    (argumentsText) => {
      const event = buildBeforeHumanInterventionEvent({ operationId: 'op', stepIndex: 2 }, [
        {
          apiName: 'write',
          arguments: argumentsText,
          id: 'native',
          identifier: 'files',
          type: 'builtin',
        },
      ]);
      expect(event.pendingTools[0]).toEqual({
        apiName: 'write',
        args: undefined,
        arguments: argumentsText,
        identifier: 'files',
        toolCallId: 'native',
      });
    },
  );

  it('keeps existing minimal event producers compatible', () => {
    const before: BeforeHumanInterventionHookEvent = {
      operationId: 'op',
      pendingTools: [{ apiName: 'write', identifier: 'files' }],
      stepIndex: 1,
    };
    const after: AfterHumanInterventionHookEvent = {
      action: 'approve',
      operationId: 'op',
      toolCallId: 'native',
    };
    const stop: StopByHumanInterventionHookEvent = { operationId: 'op', rejectionReason: 'no' };
    expect([before, after, stop].map(({ operationId }) => operationId)).toEqual(['op', 'op', 'op']);
  });
});
