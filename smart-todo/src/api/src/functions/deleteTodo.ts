import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { ApiError } from '../models/errors.js';
import { noContent, errorResponse } from '../http.js';

export async function deleteTodo(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    if (!id) throw ApiError.validation('Todo id is required.');

    const store = await getDataStore();
    await store.todos.delete(id);
    return noContent();
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('deleteTodo', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'todos/{id}',
  handler: deleteTodo,
});
