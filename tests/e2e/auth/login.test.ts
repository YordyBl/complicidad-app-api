/**
 * E2E tests for the /auth/login endpoint.
 *
 * These tests use supertest against an Express application with the
 * auth module mounted and fake dependencies injected.
 * They do NOT require a running PostgreSQL instance.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { json } from 'express';
import type { Express } from 'express';
import { createAuthRouter } from '../../../src/modules/auth-users/interfaces/http/auth-routes.js';
import { AuthController } from '../../../src/modules/auth-users/interfaces/http/AuthController.js';
import { LoginUseCase } from '../../../src/modules/auth-users/application/use-cases/LoginUseCase.js';
import { RegisterUserUseCase } from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import type { UserRepository } from '../../../src/modules/auth-users/domain/UserRepository.js';
import type { PasswordHashService } from '../../../src/modules/auth-users/domain/PasswordHashService.js';
import type { TokenService, TokenPayload } from '../../../src/modules/auth-users/domain/TokenService.js';
import { User } from '../../../src/modules/auth-users/domain/User.js';
import { UserId } from '../../../src/modules/auth-users/domain/UserId.js';

const VALID_EMAIL = 'admin@complicidad.test';
const VALID_PASSWORD = 'correct-horse-battery-staple';

// ── Fakes (same pattern as unit test) ────────────────────────

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

  setUser(user: User): void {
    this.users.set(user.id.toString(), user);
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

function createTestApp(loginUseCase: LoginUseCase, registerUseCase: RegisterUserUseCase): Express {
  const app = express();
  app.use(json());
  const controller = new AuthController(loginUseCase, registerUseCase);
  const router = createAuthRouter(controller);
  app.use('/auth', router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /auth/login (E2E)', () => {
  let app: Express;

  beforeAll(() => {
    const repo = new FakeUserRepository();
    repo.setUser(
      new User(
        UserId.generate(),
        VALID_EMAIL,
        `hashed:${VALID_PASSWORD}`,
        'Admin',
        'admin',
        true,
        new Date('2025-01-01'),
        new Date('2025-01-01'),
      ),
    );

    const hasher = new FakePasswordHasher();
    const tokenService = new FakeTokenService();
    const loginUseCase = new LoginUseCase(repo, hasher, tokenService);
    const registerUseCase = new RegisterUserUseCase(repo, hasher);
    app = createTestApp(loginUseCase, registerUseCase);
  });

  it('should return 200 and a token for valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(VALID_EMAIL);
    expect(res.body.user.name).toBe('Admin');
    expect(res.body.user.role).toBe('admin');
  });

  it('should return 401 for invalid email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@complicidad.test', password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AuthenticationError');
    expect(res.body.message).toBe('Credenciales inválidas');
  });

  it('should return 401 for invalid password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: VALID_EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AuthenticationError');
    expect(res.body.message).toBe('Credenciales inválidas');
  });

  it('should return 400 for missing fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('should return 400 for empty email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '', password: 'something' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('should return 400 for non-string fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: true, password: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('should trim and lowercase the email before searching', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '  ADMIN@complicidad.test  ', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_EMAIL);
  });
});
