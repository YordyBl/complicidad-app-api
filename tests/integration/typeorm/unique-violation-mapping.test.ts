/**
 * Infrastructure test: UserTypeOrmRepository unique violation mapping.
 *
 * Verifies that PostgreSQL error code 23505 (unique_violation) is mapped
 * to DuplicateUserEmailError without leaking TypeORM internals.
 */
import { describe, it, expect } from 'vitest';
import type { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { UserTypeOrmRepository } from '../../../src/modules/auth-users/infrastructure/typeorm/UserTypeOrmRepository.js';
import { DuplicateUserEmailError } from '../../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import { User } from '../../../src/modules/auth-users/domain/User.js';
import { UserId } from '../../../src/modules/auth-users/domain/UserId.js';

describe('UserTypeOrmRepository — unique violation mapping', () => {
  it('should throw DuplicateUserEmailError on PostgreSQL 23505 (unique_violation)', async () => {
    // Create a repository instance with a mock manager that throws on save
    const mockManager = {
      getRepository: () => ({
        findOne: () => Promise.resolve(null),
        save: () => {
          // Simulate a PostgreSQL unique violation
          const error = new QueryFailedError(
            'INSERT INTO users ...',
            [],
            new Error('duplicate key value violates unique constraint'),
          );
          // Monkey-patch the driverError with a PostgreSQL-style code
          (error as unknown as { driverError: { code: string } }).driverError = {
            code: '23505',
          };
          throw error;
        },
        delete: () => Promise.resolve(),
        find: () => Promise.resolve([]),
      }),
    } as unknown as EntityManager;

    const repo = new UserTypeOrmRepository(mockManager);

    const user = new User(
      UserId.generate(),
      'test@example.com',
      'hashed-password',
      'Test User',
      'employee',
      true,
      new Date(),
      new Date(),
    );

    await expect(repo.save(user)).rejects.toThrow(DuplicateUserEmailError);
  });

  it('should NOT mask non-unique-violation errors', async () => {
    const mockManager = {
      getRepository: () => ({
        findOne: () => Promise.resolve(null),
        save: () => {
          throw new Error('Some random DB error');
        },
        delete: () => Promise.resolve(),
        find: () => Promise.resolve([]),
      }),
    } as unknown as EntityManager;

    const repo = new UserTypeOrmRepository(mockManager);

    const user = new User(
      UserId.generate(),
      'test@example.com',
      'hashed-password',
      'Test User',
      'employee',
      true,
      new Date(),
      new Date(),
    );

    await expect(repo.save(user)).rejects.toThrow('Some random DB error');
    await expect(repo.save(user)).rejects.not.toThrow(DuplicateUserEmailError);
  });
});
