import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  addItemSchema,
  assignStaffSchema,
  checkInSchema,
  deliverSchema,
  PERMISSIONS as P,
  reasonSchema,
  type AddItemInput,
  type AssignStaffInput,
  type CheckInInput,
  type ReasonInput,
} from '@motospa/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequireAnyPermission, RequirePermission } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { WorkOrdersService } from './work-orders.service.js';

const Id = () => new ParseUUIDPipe({ version: '4' });

@Controller()
export class WorkOrdersController {
  constructor(private readonly orders: WorkOrdersService) {}

  @Post('work-orders/check-in')
  @RequirePermission(P.ORDERS_CHECKIN)
  checkIn(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(checkInSchema)) body: CheckInInput) {
    return this.orders.checkIn(auth, body);
  }

  @Get('work-orders/board')
  @RequireAnyPermission(P.ORDERS_VIEW_ALL, P.ORDERS_VIEW_OWN)
  board(@CurrentAuth() auth: AuthContext) {
    return this.orders.board(auth);
  }

  @Get('work-orders/:id')
  @RequireAnyPermission(P.ORDERS_VIEW_ALL, P.ORDERS_VIEW_OWN)
  detail(@CurrentAuth() auth: AuthContext, @Param('id', Id()) id: string) {
    return this.orders.detail(auth, id);
  }

  @Post('work-orders/:id/items')
  @RequirePermission(P.ORDERS_CHECKIN)
  addItem(
    @CurrentAuth() auth: AuthContext,
    @Param('id', Id()) id: string,
    @Body(new ZodPipe(addItemSchema)) body: AddItemInput,
  ) {
    return this.orders.addItem(auth, id, body.serviceId);
  }

  @Post('work-orders/:id/cancel')
  @RequirePermission(P.ORDERS_CANCEL)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id', Id()) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.orders.cancel(auth, id, body.reason);
  }

  @Post('work-orders/:id/deliver')
  @RequirePermission(P.ORDERS_CHECKIN)
  deliver(
    @CurrentAuth() auth: AuthContext,
    @Param('id', Id()) id: string,
    @Body(new ZodPipe(deliverSchema)) _body: unknown,
  ) {
    return this.orders.deliver(auth, id);
  }

  @Patch('work-order-items/:id/start')
  @RequirePermission(P.ORDERS_EXECUTE)
  start(@CurrentAuth() auth: AuthContext, @Param('id', Id()) id: string) {
    return this.orders.startItem(auth, id);
  }

  @Patch('work-order-items/:id/finish')
  @RequirePermission(P.ORDERS_EXECUTE)
  finish(@CurrentAuth() auth: AuthContext, @Param('id', Id()) id: string) {
    return this.orders.finishItem(auth, id);
  }

  @Put('work-order-items/:id/staff')
  @RequirePermission(P.ORDERS_REASSIGN)
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('id', Id()) id: string,
    @Body(new ZodPipe(assignStaffSchema)) body: AssignStaffInput,
  ) {
    return this.orders.assignStaff(auth, id, body.employeeIds);
  }

  @Post('work-order-items/:id/cancel')
  @RequirePermission(P.ORDERS_CHECKIN)
  cancelItem(
    @CurrentAuth() auth: AuthContext,
    @Param('id', Id()) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.orders.cancelItem(auth, id, body.reason);
  }
}
