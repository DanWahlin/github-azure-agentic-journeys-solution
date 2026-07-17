import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAutoStatus } from '../src/logic.ts';
import type { ActionStep } from '../src/models/actionStep.ts';

function step(order: number, isCompleted: boolean): ActionStep {
  return { id: `s${order}`, todoId: 't', title: `s${order}`, description: 'd', order, isCompleted, createdAt: '2020-01-01T00:00:00.000Z' };
}

test('all steps completed marks todo completed', () => {
  const steps = [step(1, true), step(2, true), step(3, true)];
  assert.equal(computeAutoStatus(steps, 'in_progress'), 'completed');
});

test('already completed with all done needs no change', () => {
  const steps = [step(1, true), step(2, true)];
  assert.equal(computeAutoStatus(steps, 'completed'), null);
});

test('unchecking a step reverts completed to in_progress', () => {
  const steps = [step(1, true), step(2, false)];
  assert.equal(computeAutoStatus(steps, 'completed'), 'in_progress');
});

test('partial completion in non-completed status needs no change', () => {
  const steps = [step(1, true), step(2, false)];
  assert.equal(computeAutoStatus(steps, 'in_progress'), null);
});

test('no steps means no status change', () => {
  assert.equal(computeAutoStatus([], 'pending'), null);
});
