import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';

export interface VerifiedToken {
  authUserId: string;
  /** Viene de app_metadata (no editable por el usuario). */
  tenantId: string;
}

/**
 * Verifica los access tokens de Supabase Auth con las llaves públicas (JWKS)
 * del proyecto. Requiere llaves de firma asimétricas (por defecto en proyectos nuevos).
 */
@Injectable()
export class TokenVerifierService {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<Env, true>) {
    this.issuer = `${config.get('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });
      const appMetadata = (payload.app_metadata ?? {}) as { tenant_id?: unknown };
      if (typeof payload.sub !== 'string' || typeof appMetadata.tenant_id !== 'string') {
        throw new Error('Token sin sub o tenant_id');
      }
      return { authUserId: payload.sub, tenantId: appMetadata.tenant_id };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
