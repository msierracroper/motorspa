import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { PERMISSIONS as P } from '@motospa/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequireAnyPermission } from '../auth/decorators.js';
import { ParkingService } from './parking.service.js';

@Controller('parking')
@RequireAnyPermission(P.ORDERS_CHECKIN, P.PAYMENTS_CHARGE)
export class ParkingController {
  constructor(private readonly parking: ParkingService) {}

  @Get('quote')
  quote(@CurrentAuth() auth: AuthContext, @Query('workOrderId', ParseUUIDPipe) id: string) {
    return this.parking.quote(auth, id);
  }

  @Get('rate')
  rate(@CurrentAuth() auth: AuthContext) {
    return this.parking.activeRate(auth);
  }

  @Get('occupancy')
  occupancy(@CurrentAuth() auth: AuthContext) {
    return this.parking.occupancy(auth);
  }
}
