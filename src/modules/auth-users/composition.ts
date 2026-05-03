/**
 * Auth module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap (server.ts) once the DataSource is available.
 */
import { Router } from 'express';
import { UserTypeOrmRepository } from './infrastructure/typeorm/UserTypeOrmRepository.js';
import { BcryptPasswordService } from './infrastructure/services/BcryptPasswordService.js';
import { JwtTokenService } from './infrastructure/services/JwtTokenService.js';
import { LoginUseCase } from './application/use-cases/LoginUseCase.js';
import { AuthController } from './interfaces/http/AuthController.js';
import { createAuthRouter } from './interfaces/http/auth-routes.js';
import { env } from '../../config/env.js';
import type { EntityManager } from 'typeorm';

/**
 * Create and wire the auth module, returning an Express Router.
 *
 * @param manager - TypeORM EntityManager (from DataSource) or `undefined` when
 *                  the database is not available. Without a DB, the route will
 *                  return 503 Service Unavailable.
 */
export function createAuthModule(manager?: EntityManager): Router {
  if (!manager) {
    const router = Router();
    router.all('*', (_req, res) => {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Database not connected — auth endpoints unavailable',
      });
    });
    return router;
  }

  const userRepo = new UserTypeOrmRepository(manager);
  const passwordHasher = new BcryptPasswordService();
  const tokenService = new JwtTokenService(env.jwt.secret);
  const loginUseCase = new LoginUseCase(userRepo, passwordHasher, tokenService);
  const authController = new AuthController(loginUseCase);

  return createAuthRouter(authController);
}
