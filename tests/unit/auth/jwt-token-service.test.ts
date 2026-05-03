/**
 * Unit tests for JwtTokenService — the real JWT adapter.
 *
 * Verifies:
 * - Token signing produces a valid JWT with expected claims
 * - Token expiry is approximately 5 days from iat
 * - Token verification succeeds with the correct secret
 * - Token verification fails with an incorrect secret
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { JwtTokenService } from '../../../src/modules/auth-users/infrastructure/services/JwtTokenService.js';

const TEST_SECRET = 'test-secret-for-unit-tests-only';
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 60_000; // 1 minute tolerance for test execution delay

describe('JwtTokenService', () => {
  const service = new JwtTokenService(TEST_SECRET);

  it('signs a token that decodes with expected identity claims', async () => {
    const token = await service.sign({
      sub: 'user-123',
      role: 'admin',
      email: 'admin@test.com',
    });

    const decoded = jwt.decode(token) as Record<string, unknown> | null;
    expect(decoded).not.toBeNull();
    expect(decoded!.sub).toBe('user-123');
    expect(decoded!.role).toBe('admin');
    expect(decoded!.email).toBe('admin@test.com');
  });

  it('sets iat and exp claims on the token', async () => {
    const token = await service.sign({
      sub: 'user-456',
      role: 'cashier',
      email: 'cashier@test.com',
    });

    const decoded = jwt.decode(token) as Record<string, unknown> | null;
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.iat).toBe('number');
    expect(typeof decoded!.exp).toBe('number');
  });

  it('sets exp approximately 5 days from iat', async () => {
    const token = await service.sign({
      sub: 'user-789',
      role: 'admin',
      email: 'admin@test.com',
    });

    const decoded = jwt.decode(token) as { iat: number; exp: number } | null;
    expect(decoded).not.toBeNull();

    const diffMs = (decoded!.exp - decoded!.iat) * 1000;
    const expectedMs = FIVE_DAYS_MS;

    expect(Math.abs(diffMs - expectedMs)).toBeLessThanOrEqual(TOLERANCE_MS);
  });

  it('verifies a token signed with the correct secret', async () => {
    const token = await service.sign({
      sub: 'user-verify',
      role: 'admin',
      email: 'admin@test.com',
    });

    const payload = await service.verify(token);
    expect(payload.sub).toBe('user-verify');
    expect(payload.role).toBe('admin');
  });

  it('throws when verifying a token signed with a different secret', async () => {
    const token = await service.sign({
      sub: 'user-wrong-secret',
      role: 'admin',
      email: 'admin@test.com',
    });

    const wrongService = new JwtTokenService('different-secret');
    await expect(wrongService.verify(token)).rejects.toThrow();
  });
});
