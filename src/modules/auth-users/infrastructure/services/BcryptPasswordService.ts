/**
 * bcrypt-backed password hashing adapter.
 *
 * Implements the PasswordHashService port from the domain layer.
 * Pure infrastructure — never imported by domain code.
 */
import bcrypt from 'bcryptjs';
import type { PasswordHashService } from '../../domain/PasswordHashService.js';

const SALT_ROUNDS = 12;

export class BcryptPasswordService implements PasswordHashService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
