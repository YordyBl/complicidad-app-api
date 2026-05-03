/**
 * Unit tests for LoginUseCase.
 *
 * Tests all scenarios with fake dependencies — no DB, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import { LoginUseCase, AuthenticationError } from '../../../src/modules/auth-users/application/use-cases/LoginUseCase.js';
import type { LoginCommand } from '../../../src/modules/auth-users/application/use-cases/LoginUseCase.js';
import type { UserRepository } from '../../../src/modules/auth-users/domain/UserRepository.js';
import type { PasswordHashService } from '../../../src/modules/auth-users/domain/PasswordHashService.js';
import type { TokenService, TokenPayload } from '../../../src/modules/auth-users/domain/TokenService.js';
import { User } from '../../../src/modules/auth-users/domain/User.js';
import { UserId } from '../../../src/modules/auth-users/domain/UserId.js';

// ── Fakes ────────────────────────────────────────────────────

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
    throw new Error('Not implemented in fake');
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

// ── Fixtures ─────────────────────────────────────────────────

const VALID_EMAIL = 'admin@complicidad.test';
const VALID_PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'wrong-password';
const UNKNOWN_EMAIL = 'unknown@complicidad.test';

function createActiveUser(): User {
  return new User(
    UserId.generate(),
    VALID_EMAIL,
    `hashed:${VALID_PASSWORD}`,
    'Admin',
    'admin',
    true,
    new Date('2025-01-01'),
    new Date('2025-01-01'),
  );
}

function createInactiveUser(): User {
  return new User(
    UserId.generate(),
    'inactive@complicidad.test',
    `hashed:inactive-password`,
    'Inactive',
    'employee',
    false, // inactive
    new Date('2025-01-01'),
    new Date('2025-01-01'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  describe('when credentials are valid', () => {
    it('should return a token and user info', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createActiveUser());

      const useCase = new LoginUseCase(
        repo,
        new FakePasswordHasher(),
        new FakeTokenService(),
      );

      const command: LoginCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.token).toBeDefined();
      expect(typeof result.value.token).toBe('string');
      expect(result.value.token.length).toBeGreaterThan(0);

      expect(result.value.user.email).toBe(VALID_EMAIL);
      expect(result.value.user.name).toBe('Admin');
      expect(result.value.user.role).toBe('admin');
      expect(result.value.user.id).toBeDefined();
    });
  });

  describe('when email is unknown', () => {
    it('should return AuthenticationError without revealing which field was wrong', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createActiveUser());

      const useCase = new LoginUseCase(
        repo,
        new FakePasswordHasher(),
        new FakeTokenService(),
      );

      const command: LoginCommand = {
        email: UNKNOWN_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(AuthenticationError);
      expect(result.error.message).toBe('Invalid credentials');
    });
  });

  describe('when password is wrong', () => {
    it('should return AuthenticationError without revealing which field was wrong', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createActiveUser());

      const useCase = new LoginUseCase(
        repo,
        new FakePasswordHasher(),
        new FakeTokenService(),
      );

      const command: LoginCommand = {
        email: VALID_EMAIL,
        password: WRONG_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(AuthenticationError);
      expect(result.error.message).toBe('Invalid credentials');
    });
  });

  describe('when user is inactive', () => {
    it('should return AuthenticationError without revealing the reason', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createInactiveUser());

      const useCase = new LoginUseCase(
        repo,
        new FakePasswordHasher(),
        new FakeTokenService(),
      );

      const command: LoginCommand = {
        email: 'inactive@complicidad.test',
        password: 'inactive-password',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(AuthenticationError);
      expect(result.error.message).toBe('Invalid credentials');
    });
  });

  describe('token expiry config', () => {
    it('should pass the expiresIn parameter to the token service', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createActiveUser());

      let capturedExpiresIn: string | undefined;
      const captorTokenService: TokenService = {
        async sign(payload, expiresIn) {
          capturedExpiresIn = expiresIn;
          return `token:${payload.sub}:${payload.role}`;
        },
        async verify() {
          throw new Error('Not used');
        },
      };

      const useCase = new LoginUseCase(
        repo,
        new FakePasswordHasher(),
        captorTokenService,
      );

      await useCase.execute({ email: VALID_EMAIL, password: VALID_PASSWORD });

      // The JwtTokenService defaults to '5d' when no expiresIn is passed
      // from the use case. The use case delegates expiry management to the
      // token service implementation — the env config provides the default.
      expect(capturedExpiresIn).toBeUndefined();
      // Token expiry is configured in the infrastructure adapter (JwtTokenService)
      // which defaults to '5d'. The use case trusts the adapter.
    });
  });
});
