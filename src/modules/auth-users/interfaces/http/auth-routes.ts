/**
 * Auth route registration.
 *
 * Creates an Express Router with auth endpoints wired to the controller.
 * Mounted under `/api/v1` via the application bootstrap — the resulting
 * routes are `/api/v1/login` and `/api/v1/register`.
 */
import { Router } from 'express';
import type { AuthController } from './AuthController.js';

export function createAuthRouter(authController: AuthController): Router {
  const router = Router();

  router.post('/login', (req, res, next) => {
    authController.login(req, res).catch(next);
  });

  router.post('/register', (req, res, next) => {
    authController.register(req, res).catch(next);
  });

  return router;
}
