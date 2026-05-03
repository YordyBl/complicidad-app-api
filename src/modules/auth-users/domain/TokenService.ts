/**
 * Token service port — domain abstraction over JWT or any token format.
 *
 * Keeps the domain free of jsonwebtoken imports.
 * The payload type carries identity + RBAC claims for future enforcement.
 */

/** Claims embedded in every access token. */
export interface TokenPayload {
  sub: string;   // user id
  email: string;
  role: string;
  iat: number;   // issued-at (epoch seconds)
  exp: number;   // expires-at (epoch seconds)
}

export interface TokenService {
  /**
   * Create a signed token for the given payload.
   * @param payload - Claims to embed (sub, email, role).
   * @param expiresIn - Human-readable duration string (e.g. '5d', '1h').
   *                    Defaults to '5d' if omitted.
   */
  sign(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn?: string): Promise<string>;

  /**
   * Verify a token and return its decoded payload.
   * Throws if the token is invalid, expired, or tampered with.
   */
  verify(token: string): Promise<TokenPayload>;
}
