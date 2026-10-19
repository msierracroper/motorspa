import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PERMISSIONS } from '@motospa/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { CustomersService } from './customers.service.js';

@Controller()
@RequirePermission(PERMISSIONS.ORDERS_CHECKIN)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('motorcycles/search')
  searchByPlate(@CurrentAuth() auth: AuthContext, @Query('plate') plate = '') {
    return this.customers.searchByPlate(auth, plate);
  }

  @Get('motorcycles/:id/history')
  history(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.history(auth, id);
  }

  @Get('customers')
  search(@CurrentAuth() auth: AuthContext, @Query('q') q = '') {
    return this.customers.search(auth, q);
  }
}
