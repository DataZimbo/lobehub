import { describe, expect, it } from 'vitest';

import type { GoalStep } from '@/features/Conversation/Messages/GoalTaskCard/goalTaskProgress';

import {
  buildWorkflowRows,
  goalPhaseToStageIndex,
  MAX_VISIBLE_WORKFLOW_ROWS,
  mergeTopicGoals,
  sliceVisibleWorkflowRows,
  summarizeWorkflow,
} from './goalWorkflowView';

const step = (id: string, status: string, title = id) => ({
  id,
  status: status as GoalStep['status'],
  title,
});

describe('goalPhaseToStageIndex', () => {
  it.each([
    ['running', 1],
    ['waiting', 1],
    ['repairing', 1],
    ['paused', 1],
    ['error', 1],
    ['verifying', 2],
    ['review', 3],
    ['achieved', 4],
  ] as const)('lights stage %s for phase %s', (phase, index) => {
    expect(goalPhaseToStageIndex(phase)).toBe(index);
  });

  it('keeps a planning goal on the Plan stage even though its phase reads running', () => {
    expect(goalPhaseToStageIndex('running', 'planning')).toBe(0);
    expect(goalPhaseToStageIndex('waiting', 'planning')).toBe(0);
    expect(goalPhaseToStageIndex('running', 'running')).toBe(1);
  });
});

describe('mergeTopicGoals', () => {
  it('appends topic-linked goals that no message derived, deduped by id', () => {
    const merged = mergeTopicGoals(
      [{ criteriaCount: 2, goalId: 'goal-tool', name: 'From tool' }],
      [
        { goal: { id: 'goal-tool', title: 'Persisted copy' } },
        { goal: { id: 'goal-cli', title: 'Created by lh' } },
        { goal: { id: 'goal-cli', title: 'Duplicate row' } },
      ],
    );

    expect(merged).toEqual([
      { criteriaCount: 2, goalId: 'goal-tool', name: 'From tool' },
      { criteriaCount: 0, goalId: 'goal-cli', name: 'Created by lh' },
    ]);
  });

  it('returns the derived goals untouched when nothing is persisted yet', () => {
    const derived = [{ criteriaCount: 1, goalId: 'goal-a', name: 'A' }];
    expect(mergeTopicGoals(derived, undefined)).toEqual(derived);
  });
});

describe('buildWorkflowRows', () => {
  it('maps node statuses to row states and attaches assignees', () => {
    const rows = buildWorkflowRows(
      [
        step('a', 'resolved'),
        step('b', 'active'),
        step('c', 'waiting'),
        step('d', 'proposed'),
        step('e', 'rejected'),
      ],
      { b: 'agt-2' },
    );

    expect(rows.map((row) => row.state)).toEqual(['done', 'running', 'waiting', 'pending', 'done']);
    expect(rows[1].assigneeId).toBe('agt-2');
    expect(rows[0].assigneeId).toBeUndefined();
  });
});

describe('sliceVisibleWorkflowRows', () => {
  it('caps collapsed rows at the visible maximum', () => {
    const rows = buildWorkflowRows(Array.from({ length: 6 }, (_, i) => step(`t${i}`, 'proposed')));

    expect(sliceVisibleWorkflowRows(rows, false)).toHaveLength(MAX_VISIBLE_WORKFLOW_ROWS);
    expect(sliceVisibleWorkflowRows(rows, true)).toHaveLength(6);
  });
});

describe('summarizeWorkflow', () => {
  it('counts done and running rows for the header summary', () => {
    const rows = buildWorkflowRows([
      step('a', 'resolved'),
      step('b', 'active'),
      step('c', 'active'),
      step('d', 'proposed'),
    ]);

    expect(summarizeWorkflow(rows)).toEqual({ done: 1, running: 2, total: 4 });
  });
});
