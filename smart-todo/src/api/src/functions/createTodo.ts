import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getDataStore } from '../data/factory.js';
import { validateCreateTodo } from '../validation.js';
import { json, errorResponse, readJsonBody } from '../http.js';

export async function createTodo(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await readJsonBody(request);
    const input = validateCreateTodo(body);
    const store = await getDataStore();
    const todo = await store.todos.create(input);
    return json(201, todo);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('createTodo', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'todos',
  handler: createTodo,
});
