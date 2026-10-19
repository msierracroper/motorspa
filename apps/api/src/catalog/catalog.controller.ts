import { Controller, Get } from '@nestjs/common';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators.js';
import { CatalogServiceRepo } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogServiceRepo) {}

  /** Servicios activos con precios por cilindraje (cualquier usuario autenticado). */
  @Get('services')
  list(@CurrentAuth() auth: AuthContext) {
    return this.catalog.list(auth);
  }
}
