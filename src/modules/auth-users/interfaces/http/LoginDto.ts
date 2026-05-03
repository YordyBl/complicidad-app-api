/**
 * Request/response DTOs for the login endpoint.
 *
 * These are plain objects — no class-validator decorators.
 * Validation is explicit in the controller or middleware.
 */

/** POST /auth/login request body. */
export interface LoginRequestDto {
  email: string;
  password: string;
}

/** POST /auth/login response body. */
export interface LoginResponseDto {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/** POST /auth/login error response body. */
export interface LoginErrorDto {
  error: string;
  message: string;
}
