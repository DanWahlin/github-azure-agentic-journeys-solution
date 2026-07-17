import { Router } from 'express';
import type { DataStore } from '../data/interfaces.js';
import { AppError } from '../errors.js';
import { validateCreateOrder, type CreateOrderInput } from '../models/order.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { parsePagination, totalPages } from '../http/pagination.js';

export function createOrdersRouter(store: DataStore): Router {
  const router = Router();

  // GET /api/orders?userId=xxx
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.query.userId;
      if (typeof userId !== 'string' || userId.trim() === '') {
        throw AppError.validation([{ field: 'userId', message: 'userId query parameter is required' }]);
      }
      const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
      const { data, totalCount } = await store.orders.getByUserId(userId, page, pageSize);
      res.json({
        data,
        page,
        pageSize,
        totalCount,
        totalPages: totalPages(totalCount, pageSize),
      });
    }),
  );

  // GET /api/orders/:id
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const order = await store.orders.getById(req.params.id);
      if (!order) throw AppError.notFound('Order not found');
      res.json(order);
    }),
  );

  // POST /api/orders
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const errors = validateCreateOrder(req.body);
      if (errors.length > 0) throw AppError.validation(errors);

      // Business rules (existence, active status, inventory, price capture,
      // total calculation, inventory decrement) are enforced atomically in the
      // repository's transaction.
      const order = await store.orders.create(req.body as CreateOrderInput);
      res.status(201).json(order);
    }),
  );

  return router;
}
