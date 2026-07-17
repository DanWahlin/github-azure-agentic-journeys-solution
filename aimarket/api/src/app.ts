import { Router } from 'express';
import cors from 'cors';
import express from 'express';

import type { DataStore } from './data/interfaces.js';
import type { AiServices } from './ai/services.js';
import { createProductsRouter } from './routes/products.js';
import { createOrdersRouter } from './routes/orders.js';
import { createUsersRouter } from './routes/users.js';
import { createChatRouter } from './routes/chat.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Build the Express application around an injected DataStore and optional AI
 * services. When `ai.search`/`ai.chat` are null (no credentials), the routes
 * use their graceful local fallbacks (SQLite LIKE search; chat 503).
 */
export function createApp(store: DataStore, ai: AiServices = { search: null, chat: null }): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  api.use('/products', createProductsRouter(store, ai.search));
  api.use('/orders', createOrdersRouter(store));
  api.use('/users', createUsersRouter(store));
  api.use('/chat', createChatRouter(store, ai.chat));

  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
