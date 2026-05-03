/**
 * Repository port for the User aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface,
 * not on TypeORM or any other infrastructure library.
 */
import type { User } from './User.js';
import type { UserId } from './UserId.js';

export interface UserRepository {
  /** Find a user by their unique identifier. */
  findById(id: UserId): Promise<User | null>;

  /** Find a user by their email address (unique constraint). */
  findByEmail(email: string): Promise<User | null>;

  /** Persist a user (insert or update). */
  save(user: User): Promise<void>;

  /** Delete a user by id. */
  delete(id: UserId): Promise<void>;

  /** Return all users (for admin lists). */
  findAll(): Promise<User[]>;
}
