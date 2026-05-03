/**
 * Auth route registration.
 *
 * Creates an Express Router with auth endpoints wired to the controller.
 */
import { Router } from 'express';
import type { AuthController } from './AuthController.js';

export function createAuthRouter(authController: AuthController): Router {
  const router = Router();

  router.post('/login', (req, res, next) => {
    authController.login(req, res).catch(next);
  });

  return router;
}
