/**
 * Register user use case — creates an active employee user with safe credentials.
 *
 * Follows the Result pattern from shared/domain so error paths
 * are explicit in the type system. The controller handles HTTP shape
 * validation; this use case owns normalization, role defaulting/validation,
 * duplicate checks, password hashing, and safe response mapping.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { UserRepository } from '../../domain/UserRepository.js';
import type { PasswordHashService } from '../../domain/PasswordHashService.js';
import { User } from '../../domain/User.js';
import { UserId } from '../../domain/UserId.js';
import { USER_ROLES, DEFAULT_ROLE } from '../../domain/UserRole.js';
import type { UserRole } from '../../domain/UserRole.js';

// ── Command / Response DTOs ──────────────────────────────────

export interface RegisterCommand {
  email: string;
  password: string;
  role?: string;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// ── Errors ───────────────────────────────────────────────────

/**
 * Thrown when registration input fails business-rule validation
 * (email format, password strength, invalid role).
 */
export class InputValidationError extends BusinessRuleError {
  override readonly name = 'InputValidationError' as const;

  // Uses parent BusinessRuleError constructor — no overrides needed
}

/**
 * Thrown when a duplicate email is detected — either during the
 * pre-check or as a persistent unique-violation catch from the
 * infrastructure layer.
 */
export class DuplicateUserEmailError extends BusinessRuleError {
  override readonly name = 'DuplicateUserEmailError' as const;

  constructor() {
    super('Ya existe un usuario con este email');
  }
}

// ── Use Case ─────────────────────────────────────────────────

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHashService,
  ) {}

  /**
   * Register a new active employee user.
   *
   * Returns `ok(RegisterResponse)` on success, or
   * `err(InputValidationError)` for invalid inputs, or
   * `err(DuplicateUserEmailError)` for already-registered emails.
   */
  async execute(
    command: RegisterCommand,
  ): Promise<Result<RegisterResponse, InputValidationError | DuplicateUserEmailError>> {
    // 1. Validate and normalize email
    const emailResult = this.validateAndNormalizeEmail(command.email);
    if (!emailResult.ok) return err(emailResult.error);
    const normalizedEmail = emailResult.value;

    // 2. Validate password
    const passwordResult = this.validatePassword(command.password);
    if (!passwordResult.ok) return err(passwordResult.error);

    // 3. Validate and default role
    const roleResult = this.resolveRole(command.role);
    if (!roleResult.ok) return err(roleResult.error);
    const role = roleResult.value;

    // 4. Derive name from normalized email local-part
    const name = this.deriveNameFromEmail(normalizedEmail);

    // 5. Pre-check for duplicate email (findByEmail on normalized email)
    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      return err(new DuplicateUserEmailError());
    }

    // 6. Hash password via port
    const passwordHash = await this.passwordHasher.hash(command.password);

    // 7. Create domain user (active by default)
    const now = new Date();
    const user = new User(
      UserId.generate(),
      normalizedEmail,
      passwordHash,
      name,
      role,
      true, // isActive
      now,
      now,
    );

    // 8. Save — catch race-condition unique violations from infrastructure
    try {
      await this.userRepository.save(user);
    } catch (error: unknown) {
      if (error instanceof DuplicateUserEmailError) {
        return err(error);
      }
      throw error;
    }

    // 9. Return safe response — no passwordHash, no tokens
    return ok({
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  }

  // ── Private validation helpers ──────────────────────────────

  /**
   * Normalize email: trim, lowercase, validate basic format.
   */
  private validateAndNormalizeEmail(
    email: string,
  ): Result<string, InputValidationError> {
    if (!email) {
      return err(new InputValidationError('El email es obligatorio y no puede estar vacío'));
    }

    const trimmed = email.trim().toLowerCase();

    if (trimmed.length === 0) {
      return err(new InputValidationError('El email no puede estar vacío'));
    }

    const atIndex = trimmed.indexOf('@');
    if (atIndex < 1 || atIndex === trimmed.length - 1) {
      return err(new InputValidationError('El formato del email es inválido'));
    }

    return ok(trimmed);
  }

  /**
   * Validate password: non-empty, minimum 8 characters.
   */
  private validatePassword(password: string): Result<void, InputValidationError> {
    if (!password) {
      return err(new InputValidationError('La contraseña es obligatoria y no puede estar vacía'));
    }

    if (password.length < 8) {
      return err(new InputValidationError('La contraseña debe tener al menos 8 caracteres'));
    }

    return ok(undefined);
  }

  /**
   * Validate and default the role. Returns DEFAULT_ROLE when omitted.
   */
  private resolveRole(role?: string): Result<UserRole, InputValidationError> {
    if (role === undefined || role.trim() === '') {
      return ok(DEFAULT_ROLE);
    }

    if (typeof role !== 'string') {
      return err(new InputValidationError('El rol debe ser un string'));
    }

    const trimmed = role.trim().toLowerCase();
    if (!USER_ROLES.includes(trimmed as UserRole)) {
      return err(
        new InputValidationError(
          `Rol inválido. Debe ser uno de: ${USER_ROLES.join(', ')}`,
        ),
      );
    }

    return ok(trimmed as UserRole);
  }

  /**
   * Derive the required `name` from the normalized email local-part.
   *
   * @example `ada.lovelace@example.com` → `ada.lovelace`
   */
  private deriveNameFromEmail(normalizedEmail: string): string {
    return normalizedEmail.split('@')[0] ?? 'user';
  }
}
