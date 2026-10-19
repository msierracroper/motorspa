import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@motospa/shared';
import type { AuthContext, AuthenticatedRequest } from './auth-context.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'requiredPermissions';

/** Endpoint sin autenticación (p. ej. /health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige que el usuario tenga todos los permisos indicados. */
export const RequirePermission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Inyecta el AuthContext de la petición en un parámetro del controlador. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth) throw new Error('CurrentAuth usado en un endpoint público');
    return req.auth;
  },
);
