/**
 * E2E tests for the POST /api/v1/register endpoint.
 *
 * These tests use supertest against an Express application with the
 * auth module mounted and fake dependencies injected.
 * They do NOT require a running PostgreSQL instance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { json } from 'express';
import type { Express } from 'express';
import { createAuthRouter } from '../../../src/modules/auth-users/interfaces/http/auth-routes.js';
import { AuthController } from '../../../src/modules/auth-users/interfaces/http/AuthController.js';
import { LoginUseCase } from '../../../src/modules/auth-users/application/use-cases/LoginUseCase.js';
import { RegisterUserUseCase } from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import { DuplicateUserEmailError } from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import type { UserRepository } from '../../../src/modules/auth-users/domain/UserRepository.js';
import type { PasswordHashService } from '../../../src/modules/auth-users/domain/PasswordHashService.js';
import type { TokenService, TokenPayload } from '../../../src/modules/auth-users/domain/TokenService.js';
import { User } from '../../../src/modules/auth-users/domain/User.js';
import { UserId } from '../../../src/modules/auth-users/domain/UserId.js';

const API_PREFIX = '/api/v1';
const VALID_EMAIL = 'new.user@complicidad.test';
const VALID_PASSWORD = 'secure-password-123';

// ── Fakes (same pattern as login tests) ──────────────────────

class FakePasswordHasher implements PasswordHashService {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

class FakeTokenService implements TokenService {
  async sign(
    payload: Omit<TokenPayload, 'iat' | 'exp'>,
    _expiresIn?: string,
  ): Promise<string> {
    return `token:${payload.sub}:${payload.role}`;
  }
  async verify(_token: string): Promise<TokenPayload> {
    throw new Error('Not needed');
  }
}

class FakeUserRepository implements UserRepository {
  private users = new Map<string, User>();

  /** Allow simulating duplicate-on-save. */
  private _failOnSaveWithDuplicate = false;

  setUser(user: User): void {
    this.users.set(user.id.toString(), user);
  }

  setFailOnSaveWithDuplicate(value: boolean): void {
    this._failOnSaveWithDuplicate = value;
  }

  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id.toString()) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }
  async save(user: User): Promise<void> {
    if (this._failOnSaveWithDuplicate) {
      throw new DuplicateUserEmailError();
    }
    this.users.set(user.id.toString(), user);
  }
  async delete(id: UserId): Promise<void> {
    this.users.delete(id.toString());
  }
  async findAll(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

// ── App factory ──────────────────────────────────────────────

interface TestAppDeps {
  repo: FakeUserRepository;
  hasher: FakePasswordHasher;
}

function createTestApp(): { app: Express; deps: TestAppDeps } {
  const repo = new FakeUserRepository();
  const hasher = new FakePasswordHasher();
  const tokenService = new FakeTokenService();

  const loginUseCase = new LoginUseCase(repo, hasher, tokenService);
  const registerUseCase = new RegisterUserUseCase(repo, hasher);
  const controller = new AuthController(loginUseCase, registerUseCase);
  const router = createAuthRouter(controller);

  const app = express();
  app.use(json());
  app.use(API_PREFIX, router);

  return { app, deps: { repo, hasher } };
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/v1/register (E2E)', () => {
  let app: Express;
  let deps: TestAppDeps;

  beforeEach(() => {
    const testCtx = createTestApp();
    app = testCtx.app;
    deps = testCtx.deps;
  });

  // ── Success 201 ────────────────────────────────────────────

  describe('successful registration', () => {
    it('should return 201 with safe user DTO for valid registration', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('new.user@complicidad.test');
      expect(res.body.user.name).toBe('new.user');
      expect(res.body.user.role).toBe('employee');
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.id).toEqual(expect.any(String));

      // No secrets leaked
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('token');
    });

    it('should normalize email (trim + lowercase)', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: '  New.User@Complicidad.TEST  ', password: VALID_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('new.user@complicidad.test');
    });

    it('should accept optional role', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'manager@test.com', password: VALID_PASSWORD, role: 'manager' });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('manager');
    });

    it('should default role to employee when omitted', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'worker@test.com', password: VALID_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('employee');
    });
  });

  // ── Validation 400 ─────────────────────────────────────────

  describe('validation errors (400)', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ password: VALID_PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation');
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation');
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'notanemail', password: VALID_PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('InputValidationError');
      expect(res.body.message).toContain('format');
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('InputValidationError');
      expect(res.body.message).toContain('8');
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD, role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('InputValidationError');
      expect(res.body.message).toContain('Rol');
    });

    it('should return 400 for non-string email', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 123, password: VALID_PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('should return 400 for non-string password', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });
  });

  // ── Duplicate 409 ──────────────────────────────────────────

  describe('duplicate email (409)', () => {
    it('should return 409 when email already exists', async () => {
      // First registration
      await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

      // Second registration — duplicate
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'New.User@Complicidad.test', password: VALID_PASSWORD });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DuplicateUserEmailError');
      expect(res.body.message).toContain('existe');
    });

    it('should return 409 when duplicate is caught at save (race condition)', async () => {
      deps.repo.setFailOnSaveWithDuplicate(true);

      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DuplicateUserEmailError');
    });
  });

  // ── No secret leakage ──────────────────────────────────────

  describe('no secret leakage', () => {
    it('should not expose passwordHash in any response', async () => {
      const successRes = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

      expect(successRes.body).not.toHaveProperty('passwordHash');
      expect(successRes.body.user).not.toHaveProperty('passwordHash');
      expect(successRes.body.user).not.toHaveProperty('password');

      const errorRes = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

      expect(errorRes.body).not.toHaveProperty('passwordHash');
      expect(errorRes.body).not.toHaveProperty('password');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────

  describe('edge cases', () => {
    it('should accept role with different casing (normalize to lowercase)', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'admin@test.com', password: VALID_PASSWORD, role: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('admin');
    });

    it('should derive name from local part after normalization', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({ email: 'Jane.Doe@Company.com', password: VALID_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.user.name).toBe('jane.doe');
    });

    it('should handle empty body', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/register`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
