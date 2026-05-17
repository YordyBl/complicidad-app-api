/**
 * Unit tests for ActorContextResolver — actor identity resolution seam.
 *
 * Tests that the resolver derives actorId and actorSource from trusted
 * request metadata, and rejects when identity cannot be resolved.
 */
import { describe, it, expect } from 'vitest';
import {
  ActorContextResolver,
  MissingActorIdentityError,
} from '../../../src/modules/inventory/interfaces/http/ActorContextResolver.js';
import type { ActorIdentity } from '../../../src/modules/inventory/interfaces/http/ActorContextResolver.js';

// ── Helper ───────────────────────────────────────────────────

function headers(overrides?: Record<string, string>): Record<string, string | string[] | undefined> {
  return {
    'x-actor-id': 'user-001',
    'x-actor-source': 'trusted-header',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('ActorContextResolver', () => {
  const resolver = new ActorContextResolver();

  describe('resolve from trusted headers', () => {
    it('resolves actorId and actorSource from x-actor-id and x-actor-source headers', () => {
      const result = resolver.resolve(headers());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.actorId).toBe('user-001');
      expect(result.value.actorSource).toBe('trusted-header');
    });

    it('trims whitespace from actorId header', () => {
      const result = resolver.resolve(
        headers({ 'x-actor-id': '  user-002  ' }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.actorId).toBe('user-002');
    });
  });

  describe('reject when actor identity cannot be resolved', () => {
    it('rejects when x-actor-id header is missing', () => {
      const h = headers();
      delete h['x-actor-id'];

      const result = resolver.resolve(h);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingActorIdentityError);
      expect(result.error.message).toContain('actorId');
    });

    it('rejects when x-actor-id header is empty', () => {
      const result = resolver.resolve(headers({ 'x-actor-id': '' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingActorIdentityError);
    });

    it('rejects when x-actor-source header is missing', () => {
      const h = headers();
      delete h['x-actor-source'];

      const result = resolver.resolve(h);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingActorIdentityError);
    });

    it('rejects when x-actor-source header is empty', () => {
      const result = resolver.resolve(headers({ 'x-actor-source': '' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingActorIdentityError);
    });

    it('rejects when headers object is empty', () => {
      const result = resolver.resolve({});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingActorIdentityError);
    });
  });

  describe('actor identity type safety', () => {
    it('returned identity has the correct shape', () => {
      const result = resolver.resolve(headers({ 'x-actor-id': 'test', 'x-actor-source': 'jwt' }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const identity: ActorIdentity = result.value;
      expect(typeof identity.actorId).toBe('string');
      expect(typeof identity.actorSource).toBe('string');
    });
  });
});
