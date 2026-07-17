export interface ActionStep {
  id: string;
  todoId: string;
  title: string;
  description: string;
  order: number;
  isCompleted: boolean;
  createdAt: string;
}

export interface CreateActionStepInput {
  id: string;
  todoId: string;
  title: string;
  description: string;
  order: number;
}

export interface UpdateActionStepInput {
  isCompleted?: boolean;
}
