import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { validateUpdateStep } from '../validation.js';
import { computeAutoStatus } from '../logic.js';
import { ApiError } from '../models/errors.js';
import { json, errorResponse, readJsonBody } from '../http.js';

export async function updateStep(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const todoId = request.params.id;
    const stepId = request.params.stepId;
    if (!todoId || !stepId) throw ApiError.validation('Todo id and step id are required.');

    const { isCompleted } = validateUpdateStep(await readJsonBody(request));
    const store = await getDataStore();

    const todo = await store.todos.getById(todoId);
    if (!todo) throw ApiError.notFound(`Todo ${todoId} not found.`);

    const target = todo.steps.find((s) => s.id === stepId);
    if (!target) throw ApiError.notFound(`Action step ${stepId} not found for todo ${todoId}.`);

    const updatedStep = await store.actionSteps.update(stepId, { isCompleted });

    const steps = await store.actionSteps.getByTodoId(todoId);
    const nextStatus = computeAutoStatus(steps, todo.status);
    if (nextStatus) {
      await store.todos.update(todoId, { status: nextStatus });
    }

    return json(200, updatedStep);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('updateStep', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'todos/{id}/steps/{stepId}',
  handler: updateStep,
});
