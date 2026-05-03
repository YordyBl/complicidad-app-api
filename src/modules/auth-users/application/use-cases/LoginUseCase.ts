/**
 * Login use case — authenticates an employee and issues a JWT.
 *
 * Follows the Result pattern from shared/domain so error paths
 * are explicit in the type system.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { UserRepository } from '../../domain/UserRepository.js';
import type { PasswordHashService } from '../../domain/PasswordHashService.js';
import type { TokenService } from '../../domain/TokenService.js';

// ── Command / Response DTOs ──────────────────────────────────

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// ── Errors ───────────────────────────────────────────────────

/**
 * Thrown when credentials are invalid or the user is inactive.
 * Uses a single error type so the response never reveals WHICH
 * field was wrong (security by obscurity prevention is intentional).
 */
export class AuthenticationError extends BusinessRuleError {
  override readonly name = 'AuthenticationError' as const;

  constructor() {
    super('Invalid credentials');
  }
}

// ── Use Case ─────────────────────────────────────────────────

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHashService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Attempt to authenticate with the given credentials.
   *
   * Returns `ok(LoginResponse)` on success, or
   * `err(AuthenticationError)` on any failure (invalid email,
   * wrong password, inactive user) — never reveals which.
   */
  async execute(
    command: LoginCommand,
  ): Promise<Result<LoginResponse, AuthenticationError>> {
    // 1. Look up user by email
    const user = await this.userRepository.findByEmail(command.email);

    if (!user) {
      return err(new AuthenticationError());
    }

    // 2. Check account active status
    if (!user.isActive) {
      return err(new AuthenticationError());
    }

    // 3. Verify password
    const passwordValid = await user.verifyPassword(
      command.password,
      this.passwordHasher,
    );

    if (!passwordValid) {
      return err(new AuthenticationError());
    }

    // 4. Generate JWT
    const token = await this.tokenService.sign({
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    return ok({
      token,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  }
}
