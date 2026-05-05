/**
 * Unit tests for RegisterUserUseCase.
 *
 * Tests all scenarios with fake dependencies — no DB, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import {
  RegisterUserUseCase,
  InputValidationError,
  DuplicateUserEmailError,
} from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import type { RegisterCommand } from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import type { UserRepository } from '../../../src/modules/auth-users/domain/UserRepository.js';
import type { PasswordHashService } from '../../../src/modules/auth-users/domain/PasswordHashService.js';
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

class FakeUserRepository implements UserRepository {
  private users = new Map<string, User>();

  setUser(user: User): void {
    this.users.set(user.id.toString(), user);
  }

  /** Allow simulating a duplicate-on-save scenario. */
  private _failOnSaveWithDuplicate = false;
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

// ── Fixtures ─────────────────────────────────────────────────

const VALID_EMAIL = 'ada.lovelace@example.com';
const VALID_PASSWORD = 'secure-password-123';
const EXISTING_EMAIL = 'existing@complicidad.test';

function createExistingUser(email = EXISTING_EMAIL): User {
  return new User(
    UserId.generate(),
    email,
    'some-hash',
    'Existing',
    'admin',
    true,
    new Date('2025-01-01'),
    new Date('2025-01-01'),
  );
}

// ── Helper ───────────────────────────────────────────────────

function makeUseCase(
  repo: FakeUserRepository = new FakeUserRepository(),
  hasher: FakePasswordHasher = new FakePasswordHasher(),
): RegisterUserUseCase {
  return new RegisterUserUseCase(repo, hasher);
}

// ── Tests ────────────────────────────────────────────────────

describe('RegisterUserUseCase', () => {
  // ── Valid minimal registration (Task 1.1) ──────────────────

  describe('valid minimal registration', () => {
    it('should create a user with normalized email', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: '  Ada.Lovelace@Example.com  ',
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.user.email).toBe('ada.lovelace@example.com');
    });

    it('should assign DEFAULT_ROLE when role is omitted', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.user.role).toBe('employee');
    });

    it('should derive name from the normalized email local-part', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: 'Ada.Lovelace@Example.com',
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Normalized email is `ada.lovelace@example.com`, name should be `ada.lovelace`
      expect(result.value.user.name).toBe('ada.lovelace');
    });

    it('should create an active user by default', async () => {
      const repo = new FakeUserRepository();
      const useCase = makeUseCase(repo);
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify the user is stored and active
      const stored = await repo.findByEmail('ada.lovelace@example.com');
      expect(stored).not.toBeNull();
      expect(stored!.isActive).toBe(true);
    });

    it('should return a safe DTO without password/hash fields', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const user = result.value.user;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('should hash the password before saving', async () => {
      const repo = new FakeUserRepository();
      const useCase = makeUseCase(repo);
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify stored user has hashed password, not plaintext
      const stored = await repo.findByEmail('ada.lovelace@example.com');
      expect(stored).not.toBeNull();
      expect(stored!.passwordHash).toBe(`hashed:${VALID_PASSWORD}`);
      expect(stored!.passwordHash).not.toBe(VALID_PASSWORD);
    });

    it('should accept a valid explicit role', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'admin',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.user.role).toBe('admin');
    });
  });

  // ── Invalid email (Task 1.2) ───────────────────────────────

  describe('invalid email', () => {
    it('should reject missing email', async () => {
      const useCase = makeUseCase();
      const command = { password: VALID_PASSWORD } as unknown as RegisterCommand;

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('email');
    });

    it('should reject empty email', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: '   ', password: VALID_PASSWORD };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('email');
    });

    it('should reject email without @', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: 'notanemail', password: VALID_PASSWORD };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('format');
    });

    it('should reject email with empty local part', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: '@example.com', password: VALID_PASSWORD };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('format');
    });

    it('should reject email with empty domain', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: 'user@', password: VALID_PASSWORD };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
    });
  });

  // ── Invalid password (Task 1.2) ────────────────────────────

  describe('weak or empty password', () => {
    it('should reject missing password', async () => {
      const useCase = makeUseCase();
      const command = { email: VALID_EMAIL } as unknown as RegisterCommand;

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('contraseña');
    });

    it('should reject password shorter than 8 characters', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: VALID_EMAIL, password: 'short' };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('8');
    });

    it('should reject empty password string', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = { email: VALID_EMAIL, password: '' };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
    });
  });

  // ── Invalid role (Task 1.2) ────────────────────────────────

  describe('invalid role', () => {
    it('should reject a role not in USER_ROLES', async () => {
      const useCase = makeUseCase();
      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'superadmin',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InputValidationError);
      expect(result.error.message).toContain('Rol');
    });
  });

  // ── Duplicate email — pre-check (Task 1.2) ─────────────────

  describe('duplicate email pre-check', () => {
    it('should reject registration when normalized email already exists', async () => {
      const repo = new FakeUserRepository();
      repo.setUser(createExistingUser('existing@complicidad.test'));
      const useCase = makeUseCase(repo);

      // Different case, should normalize and find the existing one
      const command: RegisterCommand = {
        email: 'Existing@Complicidad.test',
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(DuplicateUserEmailError);
    });
  });

  // ── Duplicate save error — concurrent race (Task 1.2) ──────

  describe('duplicate save error (concurrent race)', () => {
    it('should handle duplicate detected at save time (race condition)', async () => {
      const repo = new FakeUserRepository();
      repo.setFailOnSaveWithDuplicate(true);
      const useCase = makeUseCase(repo);

      const command: RegisterCommand = {
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(DuplicateUserEmailError);
    });
  });

  // ── Plaintext never persisted (Task 1.2) ──────────────────

  describe('plaintext password is never persisted', () => {
    it('should hash the password and never store plaintext', async () => {
      const repo = new FakeUserRepository();
      const useCase = makeUseCase(repo);

      const result = await useCase.execute({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const stored = await repo.findByEmail('ada.lovelace@example.com');
      expect(stored).not.toBeNull();
      // The hash is the fake's output, NOT the plaintext
      expect(stored!.passwordHash).toBe(`hashed:${VALID_PASSWORD}`);
      expect(stored!.passwordHash).not.toBe(VALID_PASSWORD);
    });
  });
});
