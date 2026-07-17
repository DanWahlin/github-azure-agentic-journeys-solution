import { Router } from 'express';
import type { DataStore } from '../data/interfaces.js';
import { AppError } from '../errors.js';
import { validateCreateUser, type CreateUserInput } from '../models/user.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export function createUsersRouter(store: DataStore): Router {
  const router = Router();

  // POST /api/users/register
  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const errors = validateCreateUser(req.body);
      if (errors.length > 0) throw AppError.validation(errors);

      const user = await store.users.create(req.body as CreateUserInput);
      res.status(201).json(user);
    }),
  );

  // GET /api/users/:id
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const user = await store.users.getById(req.params.id);
      if (!user) throw AppError.notFound('User not found');
      res.json(user);
    }),
  );

  return router;
}
