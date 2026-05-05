/**
 * jsonwebtoken-backed token service adapter.
 *
 * Implements the TokenService port from the domain layer.
 * Pure infrastructure — never imported by domain code.
 */
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { TokenService, TokenPayload } from '../../domain/TokenService.js';

const DEFAULT_EXPIRES_IN = '5d';

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  async sign(
    payload: Omit<TokenPayload, 'iat' | 'exp'>,
    expiresIn?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // SignOptions.expiresIn expects the branded `StringValue` ms type,
      // but our domain port accepts plain `string`. The cast is safe
      // because values always follow ms-format (default '5d').
      const options = { expiresIn: expiresIn ?? DEFAULT_EXPIRES_IN } as unknown as SignOptions;
      jwt.sign(
        payload,
        this.secret,
        options,
        (err, token) => {
          if (err) reject(err);
          else if (!token) reject(new Error('JWT sign devolvió un token vacío'));
          else resolve(token);
        },
      );
    });
  }

  async verify(token: string): Promise<TokenPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.secret,
        { complete: false } as jwt.VerifyOptions,
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded as unknown as TokenPayload);
        },
      );
    });
  }
}
