/**
 * Request/response DTOs for the register endpoint.
 *
 * These are plain objects — no class-validator decorators.
 * Validation is explicit in the controller or use case.
 */

/** POST /register request body (email + password required, role optional). */
export interface RegisterRequestDto {
  email: string;
  password: string;
  role?: string;
}

/** POST /register response body — safe: no password, no passwordHash, no tokens. */
export interface RegisterResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/** POST /register error response body. */
export interface RegisterErrorDto {
  error: string;
  message: string;
}
