/**
 * Password hashing port — domain abstraction over hashing algorithms.
 *
 * Keeps the domain free of bcrypt imports. Implementations live
 * in infrastructure/services.
 */
export interface PasswordHashService {
  /** Hash a plaintext password. */
  hash(plain: string): Promise<string>;

  /** Verify a plaintext password against a stored hash. */
  verify(plain: string, hash: string): Promise<boolean>;
}
