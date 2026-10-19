import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  cashMovementSchema,
  chargeSchema,
  closeShiftSchema,
  openShiftSchema,
  PERMISSIONS as P,
  reasonSchema,
  type CashMovementInput,
  type ChargeInput,
  type CloseShiftInput,
  type OpenShiftInput,
  type ReasonInput,
} from '@motospa/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequireAnyPermission, RequirePermission } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CashService } from './cash.service.js';

@Controller()
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('cash/registers')
  @RequirePermission(P.CASH_SHIFT)
  registers(@CurrentAuth() auth: AuthContext) {
    return this.cash.registers(auth);
  }

  @Get('payment-methods')
  @RequireAnyPermission(P.PAYMENTS_CHARGE, P.CASH_SHIFT)
  methods(@CurrentAuth() auth: AuthContext) {
    return this.cash.methods(auth);
  }

  @Get('cash-shifts/current')
  @RequirePermission(P.CASH_SHIFT)
  current(@CurrentAuth() auth: AuthContext) {
    return this.cash.currentShift(auth);
  }

  @Post('cash-shifts/open')
  @RequirePermission(P.CASH_SHIFT)
  open(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(openShiftSchema)) body: OpenShiftInput) {
    return this.cash.openShift(auth, body);
  }

  @Post('cash-shifts/:id/movements')
  @RequirePermission(P.EXPENSES_CASH)
  movement(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cashMovementSchema)) body: CashMovementInput,
  ) {
    return this.cash.addMovement(auth, id, body);
  }

  @Post('cash-shifts/:id/close')
  @RequirePermission(P.CASH_SHIFT)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(closeShiftSchema)) body: CloseShiftInput,
  ) {
    return this.cash.closeShift(auth, id, body);
  }

  @Get('payments/preview')
  @RequirePermission(P.PAYMENTS_CHARGE)
  preview(@CurrentAuth() auth: AuthContext, @Query('workOrderId', ParseUUIDPipe) id: string) {
    return this.cash.preview(auth, id);
  }

  @Post('payments')
  @RequirePermission(P.PAYMENTS_CHARGE)
  charge(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(chargeSchema)) body: ChargeInput) {
    return this.cash.charge(auth, body);
  }

  @Post('payments/:id/void')
  @RequirePermission(P.PAYMENTS_VOID)
  void(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.cash.voidPayment(auth, id, body.reason);
  }
}
