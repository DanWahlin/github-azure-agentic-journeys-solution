import type { Todo } from '../models/todo.js';
import type { ActionStep } from '../models/actionStep.js';

export interface SeedTodoRow {
  id: string;
  title: string;
  status: Todo['status'];
  userId: string;
  stepsGenerated: boolean;
}

export interface SeedStepRow {
  id: string;
  todoId: string;
  title: string;
  description: string;
  order: number;
  isCompleted: boolean;
}

export const SEED_USER_ID = 'user-1';

export const SEED_TODOS: SeedTodoRow[] = [
  { id: 'todo-1', title: 'Prepare Conference talk', status: 'pending', userId: SEED_USER_ID, stepsGenerated: false },
  { id: 'todo-2', title: 'Set up home office', status: 'in_progress', userId: SEED_USER_ID, stepsGenerated: true },
  { id: 'todo-3', title: 'Plan weekend hiking trip', status: 'completed', userId: SEED_USER_ID, stepsGenerated: true },
];

export const SEED_STEPS: SeedStepRow[] = [
  { id: 'step-2-1', todoId: 'todo-2', title: 'Choose a desk and chair', description: 'Pick an ergonomic desk and adjustable chair that fit your space and budget.', order: 1, isCompleted: true },
  { id: 'step-2-2', todoId: 'todo-2', title: 'Set up monitor and peripherals', description: 'Position the monitor at eye level and connect the keyboard, mouse, and webcam.', order: 2, isCompleted: true },
  { id: 'step-2-3', todoId: 'todo-2', title: 'Organize cable management', description: 'Route and bundle cables with clips or a tray to keep the desk tidy.', order: 3, isCompleted: false },
  { id: 'step-2-4', todoId: 'todo-2', title: 'Set up lighting', description: 'Add a desk lamp and reduce glare so the workspace is well lit for calls.', order: 4, isCompleted: false },
  { id: 'step-3-1', todoId: 'todo-3', title: 'Pick a trail', description: 'Choose a trail that matches your group\u2019s fitness level and available time.', order: 1, isCompleted: true },
  { id: 'step-3-2', todoId: 'todo-3', title: 'Check weather forecast', description: 'Review the forecast for the trail area and plan clothing accordingly.', order: 2, isCompleted: true },
  { id: 'step-3-3', todoId: 'todo-3', title: 'Pack gear and supplies', description: 'Pack water, snacks, a first-aid kit, map, and layers for changing weather.', order: 3, isCompleted: true },
];
