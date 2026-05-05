/**
 * Express controller for authentication endpoints.
 *
 * Translates between HTTP request/responses and the application use case.
 * No domain logic here — just request parsing, basic validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { LoginUseCase } from '../../application/use-cases/LoginUseCase.js';
import type { RegisterUserUseCase, RegisterCommand } from '../../application/use-cases/RegisterUserUseCase.js';
import {
  InputValidationError,
  DuplicateUserEmailError,
} from '../../application/use-cases/RegisterUserUseCase.js';
import type { LoginRequestDto, LoginResponseDto, LoginErrorDto } from './LoginDto.js';
import type { RegisterRequestDto, RegisterResponseDto, RegisterErrorDto } from './RegisterDto.js';

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registerUseCase: RegisterUserUseCase,
  ) {}

  /**
   * POST /login
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
        message: 'Email y contraseña son obligatorios',
      };
      res.status(400).json(body);
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      const body: LoginErrorDto = {
        error: 'ValidationError',
        message: 'Email y contraseña deben ser strings',
      };
      res.status(400).json(body);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail.length === 0 || password.length === 0) {
      const body: LoginErrorDto = {
        error: 'ValidationError',
        message: 'Email y contraseña no pueden estar vacíos',
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

  /**
   * POST /register
   *
   * Validates the request body, delegates to the use case, and returns
   * 201 on success, 400 on validation errors, or 409 on duplicate email.
   */
  async register(req: Request, res: Response): Promise<void> {
    // ── Basic HTTP shape validation ─────────────────────────
    const { email, password, role } = req.body as RegisterRequestDto;

    if (!email || !password) {
      const body: RegisterErrorDto = {
        error: 'ValidationError',
        message: 'Email y contraseña son obligatorios',
      };
      res.status(400).json(body);
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      const body: RegisterErrorDto = {
        error: 'ValidationError',
        message: 'Email y contraseña deben ser strings',
      };
      res.status(400).json(body);
      return;
    }

    if (role !== undefined && typeof role !== 'string') {
      const body: RegisterErrorDto = {
        error: 'ValidationError',
        message: 'El rol debe ser un string',
      };
      res.status(400).json(body);
      return;
    }

    // ── Execute use case ────────────────────────────────────
    const command: RegisterCommand = { email, password };
    if (role !== undefined) {
      command.role = role;
    }
    const result = await this.registerUseCase.execute(command);

    if (!result.ok) {
      if (result.error instanceof DuplicateUserEmailError) {
        const body: RegisterErrorDto = {
          error: result.error.name,
          message: result.error.message,
        };
        res.status(409).json(body);
        return;
      }

      if (result.error instanceof InputValidationError) {
        const body: RegisterErrorDto = {
          error: result.error.name,
          message: result.error.message,
        };
        res.status(400).json(body);
        return;
      }

      // Fallback — should be unreachable; cast to Error for type-safe access
      const fallbackError = result.error as Error;
      const body: RegisterErrorDto = {
        error: fallbackError.name,
        message: fallbackError.message,
      };
      res.status(400).json(body);
      return;
    }

    const body: RegisterResponseDto = {
      user: result.value.user,
    };
    res.status(201).json(body);
  }
}
