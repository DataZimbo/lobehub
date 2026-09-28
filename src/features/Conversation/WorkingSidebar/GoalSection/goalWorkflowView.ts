import type { GoalStatus } from '@lobechat/const/goal';

import type { OperationGoal } from '@/features/Conversation/Messages/GoalTaskCard/deriveOperationGoals';
import type {
  GoalStep,
  GoalTaskPhase,
} from '@/features/Conversation/Messages/GoalTaskCard/goalTaskProgress';

export const GOAL_WORKFLOW_STAGE_KEYS = [
  'workingPanel.goal.stage.planning',
  'workingPanel.goal.stage.running',
  'workingPanel.goal.stage.verifying',
  'workingPanel.goal.stage.review',
  'workingPanel.goal.stage.achieved',
] as const;

/**
 * Which rail stage a lifecycle phase lights up. A goal still `planning` sits on
 * the Plan stage whatever its phase says (the phase folds planning into
 * running). Sub-states that still mean "work is happening" (waiting on a
 * person, repairing, paused) stay on the running stage — the phase pill next to
 * the header carries the nuance.
 */
export const goalPhaseToStageIndex = (phase: GoalTaskPhase, status?: GoalStatus): number => {
  if (status === 'planning') return 0;

  switch (phase) {
    case 'verifying': {
      return 2;
    }
    case 'review': {
      return 3;
    }
    case 'achieved': {
      return 4;
    }
    default: {
      return 1;
    }
  }
};

export type GoalWorkflowRowState = 'done' | 'running' | 'waiting' | 'pending';

export interface GoalWorkflowRow {
  assigneeId?: string;
  id: string;
  state: GoalWorkflowRowState;
  title: string;
}

const CLOSED_STEP_STATUSES = new Set(['rejected', 'resolved', 'retired']);

/** Task nodes as display rows: closed steps read as done, `active` as running. */
export const buildWorkflowRows = (
  nodes: { id: string; status: GoalStep['status']; title: string }[],
  assignees?: Record<string, string>,
): GoalWorkflowRow[] =>
  nodes.map((node) => ({
    assigneeId: assignees?.[node.id],
    id: node.id,
    state: CLOSED_STEP_STATUSES.has(node.status)
      ? 'done'
      : node.status === 'active'
        ? 'running'
        : node.status === 'waiting'
          ? 'waiting'
          : 'pending',
    title: node.title,
  }));

export interface GoalWorkflowSummary {
  done: number;
  running: number;
  total: number;
}

export const summarizeWorkflow = (rows: GoalWorkflowRow[]): GoalWorkflowSummary => ({
  done: rows.filter((row) => row.state === 'done').length,
  running: rows.filter((row) => row.state === 'running').length,
  total: rows.length,
});

/** A chat sidebar keeps at most this many rows before folding into "N more". */
export const MAX_VISIBLE_WORKFLOW_ROWS = 4;

export const sliceVisibleWorkflowRows = (
  rows: GoalWorkflowRow[],
  expanded: boolean,
): GoalWorkflowRow[] => (expanded ? rows : rows.slice(0, MAX_VISIBLE_WORKFLOW_ROWS));

/**
 * Every goal the conversation created: the ones derived from its messages
 * (builtin `createGoal` results, `lh goal create` shell output) plus the goal
 * rows linked to the topic — a CLI agent's `lh goal create --conversation` can
 * leave no parseable tool result behind. Message-derived goals keep their
 * position and richer metadata; persisted-only goals follow, deduped by id.
 */
export const mergeTopicGoals = (
  derived: OperationGoal[],
  persisted: { goal: { id: string; title?: string | null } }[] = [],
): OperationGoal[] => {
  const seen = new Set(derived.map((goal) => goal.goalId));
  const linked = persisted.flatMap(({ goal }) => {
    if (seen.has(goal.id)) return [];
    seen.add(goal.id);
    return [{ criteriaCount: 0, goalId: goal.id, name: goal.title?.trim() || goal.id }];
  });

  return [...derived, ...linked];
};
