/**
 * Express controller for authentication endpoints.
 *
 * Translates between HTTP request/responses and the application use case.
 * No domain logic here — just request parsing, basic validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { LoginUseCase } from '../../application/use-cases/LoginUseCase.js';
import type { LoginRequestDto, LoginResponseDto, LoginErrorDto } from './LoginDto.js';

export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  /**
   * POST /auth/login
   *
   * Validates the request body, delegates to the use case, and returns
   * a JWT on success or a 401 error on failure.
   */
  async login(req: Request, res: Response): Promise<void> {
    // ── Basic input validation ──────────────────────────────
    const { email, password } = req.body as LoginRequestDto;

    if (!email || !password) {
      const body: LoginErrorDto = {
        error: 'ValidationError',
        message: 'Email and password are required',
      };
      res.status(400).json(body);
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      const body: LoginErrorDto = {
        error: 'ValidationError',
        message: 'Email and password must be strings',
      };
      res.status(400).json(body);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail.length === 0 || password.length === 0) {
      const body: LoginErrorDto = {
        error: 'ValidationError',
        message: 'Email and password must not be empty',
      };
      res.status(400).json(body);
      return;
    }

    // ── Execute use case ────────────────────────────────────
    const result = await this.loginUseCase.execute({
      email: trimmedEmail,
      password,
    });

    if (!result.ok) {
      // AuthenticationError — never reveal whether the email or password was wrong
      const body: LoginErrorDto = {
        error: 'AuthenticationError',
        message: result.error.message,
      };
      res.status(401).json(body);
      return;
    }

    const body: LoginResponseDto = {
      token: result.value.token,
      user: result.value.user,
    };
    res.status(200).json(body);
  }
}
