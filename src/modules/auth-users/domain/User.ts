/**
 * Pure domain entity for an internal (employee) user.
 *
 * No framework decorators, no infrastructure imports.
 * RBAC-ready via the `role` field — permission enforcement
 * is added in middleware/guards without touching this entity.
 */
import type { UserRole } from './UserRole.js';
import type { UserId } from './UserId.js';

export class User {
  constructor(
    private readonly _id: UserId,
    private _email: string,
    private _passwordHash: string,
    private _name: string,
    private _role: UserRole,
    private _isActive: boolean,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
    Object.freeze(this);
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): UserId {
    return this._id;
  }

  get email(): string {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get role(): UserRole {
    return this._role;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Expose the password hash for infrastructure mapping only.
   * Domain code should use `verifyPassword()` instead.
   */
  get passwordHash(): string {
    return this._passwordHash;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Behaviour ───────────────────────────────────────────────

  /**
   * Check whether a given plaintext password matches the stored hash.
   * Delegates to the injected hash service — the entity does NOT import bcrypt.
   */
  async verifyPassword(
    plain: string,
    hasher: { verify(plain: string, hash: string): Promise<boolean> },
  ): Promise<boolean> {
    return hasher.verify(plain, this._passwordHash);
  }

  /** Replace the password hash (e.g. on password change). */
  changePassword(newHash: string): void {
    this._passwordHash = newHash;
    this._updatedAt = new Date();
  }

  /** Deactivate this user (prevents login). */
  deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  /** Reactivate this user. */
  activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  /** String representation (safe — does not leak the hash). */
  toString(): string {
    return `User(id=${this._id.toString()}, email=${this._email}, role=${this._role}, active=${this._isActive ? 'yes' : 'no'})`;
  }
}
