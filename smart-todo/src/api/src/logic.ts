import type { ActionStep } from './models/actionStep.js';
import type { TodoStatus } from './models/todo.js';

/**
 * Auto-completion rule (PLAN.md): after a step changes, if all steps are
 * completed the todo becomes `completed`; if a step is unchecked while the todo
 * is `completed`, it reverts to `in_progress`. Returns the new status, or null
 * when no change is required.
 */
export function computeAutoStatus(steps: ActionStep[], currentStatus: TodoStatus): TodoStatus | null {
  if (steps.length === 0) return null;

  const allCompleted = steps.every((s) => s.isCompleted);

  if (allCompleted && currentStatus !== 'completed') {
    return 'completed';
  }
  if (!allCompleted && currentStatus === 'completed') {
    return 'in_progress';
  }
  return null;
}
