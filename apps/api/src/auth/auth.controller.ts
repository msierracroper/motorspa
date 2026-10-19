import { Controller, Get } from '@nestjs/common';
import type { AuthContext } from './auth-context.js';
import { CurrentAuth } from './decorators.js';

@Controller('auth')
export class AuthController {
  /** Datos del usuario en sesión, sus roles y permisos (para armar la UI). */
  @Get('me')
  me(@CurrentAuth() auth: AuthContext): AuthContext {
    return auth;
  }
}
