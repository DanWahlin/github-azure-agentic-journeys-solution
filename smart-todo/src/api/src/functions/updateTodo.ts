import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { validateUpdateTodo } from '../validation.js';
import { ApiError } from '../models/errors.js';
import { json, errorResponse, readJsonBody } from '../http.js';

export async function updateTodo(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    if (!id) throw ApiError.validation('Todo id is required.');

    const updates = validateUpdateTodo(await readJsonBody(request));
    const store = await getDataStore();

    const existing = await store.todos.getById(id);
    if (!existing) throw ApiError.notFound(`Todo ${id} not found.`);

    const updated = await store.todos.update(id, updates);
    return json(200, updated);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('updateTodo', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'todos/{id}',
  handler: updateTodo,
});
