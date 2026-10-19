import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode } from '@motospa/shared';
import { hasPermissions, type AuthenticatedRequest } from './auth-context.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './decorators.js';
import { TokenVerifierService } from './token-verifier.service.js';

/**
 * Guard global: autentica todas las rutas salvo las marcadas con @Public()
 * y valida los permisos declarados con @RequirePermission().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifierService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Falta el token de sesión');

    req.auth = await this.authService.loadContext(await this.verifier.verify(token));

    const required =
      this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, targets) ?? [];
    if (!hasPermissions(req.auth.permissions, required)) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }
    return true;
  }
}
