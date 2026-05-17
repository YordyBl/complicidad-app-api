/**
 * Actor context resolution seam at the HTTP/application boundary.
 *
 * Derives actor identity (actorId, actorSource) from trusted request metadata.
 * This is the explicit reject-by-default seam required by the adjustment spec:
 * every adjustment command MUST resolve an actor identity before execution.
 *
 * Current implementation reads from trusted headers. When runtime auth is
 * completed, this resolver will be extended to read JWT claims.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { DomainError } from '../../../../shared/domain/errors.js';

// ── Types ────────────────────────────────────────────────────

export interface ActorIdentity {
  actorId: string;
  actorSource: string;
}

// ── Error ────────────────────────────────────────────────────

export class MissingActorIdentityError extends DomainError {
  override readonly name = 'MissingActorIdentityError';

  constructor(field: string) {
    super(`Identidad del actor no resuelta: falta "${field}"`);
  }
}

// ── Resolver ─────────────────────────────────────────────────

export class ActorContextResolver {
  /**
   * Resolve actor identity from request headers.
   *
   * Looks for `x-actor-id` and `x-actor-source` headers.
   * Returns `Err(MissingActorIdentityError)` if either is missing or empty.
   *
   * @param headers - Request headers as a key-value map.
   */
  resolve(headers: Record<string, string | string[] | undefined>): Result<ActorIdentity, MissingActorIdentityError> {
    const actorId = this.readHeader(headers, 'x-actor-id');
    if (!actorId) {
      return err(new MissingActorIdentityError('actorId'));
    }

    const actorSource = this.readHeader(headers, 'x-actor-source');
    if (!actorSource) {
      return err(new MissingActorIdentityError('actorSource'));
    }

    return ok({
      actorId: actorId.trim(),
      actorSource: actorSource.trim(),
    });
  }

  /**
   * Read a single header value, returning the trimmed string or null.
   * Handles both string and string[] header formats (Express supports both).
   */
  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const value = headers[name];
    if (value === undefined) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      if (!first || first.trim().length === 0) return null;
      return first;
    }
    return value.trim().length > 0 ? value : null;
  }
}
