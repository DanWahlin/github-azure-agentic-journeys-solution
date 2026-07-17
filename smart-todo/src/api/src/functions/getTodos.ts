import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { validateUserId } from '../validation.js';
import { json, errorResponse } from '../http.js';

export async function getTodos(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const userId = validateUserId(request.query.get('userId'));
    const store = await getDataStore();
    const todos = await store.todos.getAll(userId);
    return json(200, todos);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('getTodos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'todos',
  handler: getTodos,
});
