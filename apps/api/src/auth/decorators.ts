import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@motospa/shared';
import type { AuthContext, AuthenticatedRequest } from './auth-context.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'requiredPermissions';
export const ANY_PERMISSIONS_KEY = 'anyPermissions';

/** Endpoint sin autenticación (p. ej. /health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige que el usuario tenga todos los permisos indicados. */
export const RequirePermission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Exige que el usuario tenga AL MENOS uno de los permisos indicados. */
export const RequireAnyPermission = (...permissions: PermissionCode[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

/** Inyecta el AuthContext de la petición en un parámetro del controlador. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth) throw new Error('CurrentAuth usado en un endpoint público');
    return req.auth;
  },
);
