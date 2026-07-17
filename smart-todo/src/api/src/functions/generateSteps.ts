import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { ApiError } from '../models/errors.js';
import { json, errorResponse } from '../http.js';
import {
  generateSteps as decompose,
  toStepInputs,
  createFoundryCompleter,
  type ChatCompleter,
} from '../ai/stepGenerator.js';

let completerFactory: () => ChatCompleter = () => createFoundryCompleter();

/** Test seam: override how the chat completer is created. */
export function setCompleterFactory(factory: () => ChatCompleter): void {
  completerFactory = factory;
}

export async function generateStepsHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    if (!id) throw ApiError.validation('Todo id is required.');

    const store = await getDataStore();
    const todo = await store.todos.getById(id);
    if (!todo) throw ApiError.notFound(`Todo ${id} not found.`);

    if (todo.stepsGenerated) {
      await store.actionSteps.deleteByTodoId(id);
    }

    const complete = completerFactory();
    const generated = await decompose(todo.title, complete);
    const inputs = toStepInputs(id, generated);

    for (const input of inputs) {
      await store.actionSteps.create(input);
    }

    await store.todos.update(id, { stepsGenerated: true });
    const updated = await store.todos.getById(id);
    return json(200, updated);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('generateSteps', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'todos/{id}/generate-steps',
  handler: generateStepsHandler,
});
