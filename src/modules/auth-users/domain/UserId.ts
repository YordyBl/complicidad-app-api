/**
 * Typed identifier for the User aggregate root.
 *
 * Wraps a UUID string in a type-safe value object so that
 * repository and use-case signatures are unambiguous.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class UserId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): UserId {
    return new UserId(value);
  }

  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }
}
