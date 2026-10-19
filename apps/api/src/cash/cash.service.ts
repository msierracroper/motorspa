import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  arqueo,
  discountAmount,
  effectiveLimit,
  expectedByMethod,
  paymentLinesCover,
  PERMISSIONS,
  requiresAuthorization,
  type CashMovementInput,
  type ChargeInput,
  type CloseShiftInput,
  type OpenShiftInput,
} from '@motospa/shared';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { branchOf, type AuthContext } from '../auth/auth-context.js';
import { verifyPin } from '../auth/pin.js';
import { AuditService } from '../audit/audit.service.js';
import { withDbErrors } from '../common/db-errors.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  branches,
  cashMovements,
  cashRegisters,
  cashShifts,
  discountRules,
  parkingSessions,
  paymentLines,
  paymentMethods,
  payments,
  rolePermissions,
  userBranchRoles,
  users,
  workOrderItems,
  workOrders,
} from '../db/schema.js';
import { nextSequence } from '../db/sequences.js';
import { quoteOrderParking } from '../parking/parking.service.js';

/** Diferencia de arqueo que dispara alerta si la sede no define otra (SPEC regla 11). */
const DEFAULT_CASH_ALERT_THRESHOLD = 5000;

@Injectable()
export class CashService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private scope(auth: AuthContext) {
    return { tenantId: auth.tenantId, userId: auth.userId };
  }

  // ------------------------------------------------------------------
  // Catálogos de caja
  // ------------------------------------------------------------------
  registers(auth: AuthContext) {
    return this.db.withTenant(this.scope(auth), (tx) =>
      tx
        .select({ id: cashRegisters.id, name: cashRegisters.name })
        .from(cashRegisters)
        .where(and(eq(cashRegisters.branchId, branchOf(auth)), eq(cashRegisters.active, true)))
        .orderBy(asc(cashRegisters.name)),
    );
  }

  methods(auth: AuthContext) {
    return this.db.withTenant(this.scope(auth), (tx) =>
      tx
        .select({ id: paymentMethods.id, name: paymentMethods.name, type: paymentMethods.type })
        .from(paymentMethods)
        .where(eq(paymentMethods.active, true))
        .orderBy(asc(paymentMethods.sortOrder)),
    );
  }

  // ------------------------------------------------------------------
  // Turnos (SPEC §4.9)
  // ------------------------------------------------------------------
  /** Turno abierto del usuario, con el resumen esperado por medio de pago. */
  async currentShift(auth: AuthContext) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const shift = await openShiftOf(tx, auth);
      return shift ? { ...shift, summary: await shiftSummary(tx, shift) } : null;
    });
  }

  async openShift(auth: AuthContext, input: OpenShiftInput) {
    return withDbErrors(() =>
      this.db.withTenant(this.scope(auth), async (tx) => {
        if (await openShiftOf(tx, auth)) throw new ConflictException('Ya tienes un turno abierto');
        const [register] = await tx
          .select()
          .from(cashRegisters)
          .where(and(eq(cashRegisters.id, input.registerId), eq(cashRegisters.active, true)));
        if (!register) throw new BadRequestException('La caja no existe');
        const [shift] = await tx
          .insert(cashShifts)
          .values({
            tenantId: auth.tenantId,
            branchId: register.branchId,
            registerId: register.id,
            openedBy: auth.userId,
            openingAmount: input.openingAmount,
          })
          .returning();
        await this.audit.log(tx, auth, {
          entity: 'cash_shift',
          entityId: shift!.id,
          branchId: register.branchId,
          action: 'OPEN',
          after: { register: register.name, openingAmount: input.openingAmount },
        });
        return shift!;
      }),
    );
  }

  async addMovement(auth: AuthContext, shiftId: string, input: CashMovementInput) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const shift = await ownOpenShift(tx, auth, shiftId);
      const [movement] = await tx
        .insert(cashMovements)
        .values({ tenantId: auth.tenantId, shiftId: shift.id, ...input, createdBy: auth.userId })
        .returning();
      await this.audit.log(tx, auth, {
        entity: 'cash_movement',
        entityId: movement!.id,
        branchId: shift.branchId,
        action: input.type,
        after: input,
      });
      return movement!;
    });
  }

  async closeShift(auth: AuthContext, shiftId: string, input: CloseShiftInput) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const shift = await ownOpenShift(tx, auth, shiftId);
      const summary = await shiftSummary(tx, shift);
      const result = arqueo(summary.expected, input.counted);
      const threshold = await alertThreshold(tx, shift.branchId);
      await tx
        .update(cashShifts)
        .set({
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: auth.userId,
          expected: summary.expected,
          counted: input.counted,
          difference: result.totalDifference,
          notes: input.notes ?? null,
        })
        .where(eq(cashShifts.id, shift.id));
      const alert = Math.abs(result.totalDifference) > threshold;
      await this.audit.log(tx, auth, {
        entity: 'cash_shift',
        entityId: shift.id,
        branchId: shift.branchId,
        action: 'CLOSE',
        after: {
          expected: summary.expected,
          counted: input.counted,
          difference: result.totalDifference,
          alert,
        },
        reason: input.notes,
      });
      return { ...result, alert, threshold };
    });
  }

  // ------------------------------------------------------------------
  // Cobro (SPEC §4.9, reglas 3 y 8)
  // ------------------------------------------------------------------
  /** Lo que se cobraría ahora: servicios, parqueo cotizado y el límite de descuento del usuario. */
  async preview(auth: AuthContext, orderId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const order = await chargeableOrder(tx, orderId);
      const servicesAmount = await servicesTotal(tx, orderId);
      const parking = await quoteOrderParking(tx, orderId);
      const limit = await discountLimitOf(tx, auth.userId);
      return {
        workOrderId: orderId,
        status: order.status,
        servicesAmount,
        parking: parking?.quote ?? null,
        subtotal: servicesAmount + (parking?.quote.amount ?? 0),
        discountLimit: limit,
      };
    });
  }

  async charge(auth: AuthContext, input: ChargeInput) {
    return withDbErrors(() =>
      this.db.withTenant(this.scope(auth), async (tx) => {
        // Regla 3: sin turno de caja abierto no se cobra.
        const shift = await openShiftOf(tx, auth);
        if (!shift) throw new ConflictException('Abre un turno de caja antes de cobrar');

        const order = await chargeableOrder(tx, input.workOrderId, true);
        const servicesAmount = await servicesTotal(tx, order.id);
        const now = new Date();
        const parking = await quoteOrderParking(tx, order.id, now);
        const parkingAmount = parking?.quote.amount ?? 0;
        const subtotal = servicesAmount + parkingAmount;

        // Regla 8: descuento dentro del límite del rol o con autorización
        const discount = discountAmount(subtotal, input.discount ?? null);
        let authorizedBy: string | null = null;
        if (discount > 0) {
          if (!auth.permissions.includes(PERMISSIONS.DISCOUNTS_APPLY)) {
            throw new ForbiddenException('No tienes permiso para aplicar descuentos');
          }
          const limit = await discountLimitOf(tx, auth.userId);
          if (requiresAuthorization(subtotal, discount, limit)) {
            if (!input.authorization) {
              throw new ForbiddenException({
                message: 'El descuento supera tu límite: pide la autorización de un supervisor',
                code: 'DISCOUNT_AUTH_REQUIRED',
              });
            }
            authorizedBy = await verifyAuthorizer(tx, input.authorization);
          }
        }
        const total = subtotal - discount;

        // Pagos mixtos: deben cubrir exactamente el total
        if (total === 0 ? input.lines.length > 0 : !paymentLinesCover(total, input.lines)) {
          throw new BadRequestException(
            `Los pagos deben sumar exactamente el total (${total.toLocaleString('es-CO')})`,
          );
        }
        if (input.lines.length) {
          const ids = [...new Set(input.lines.map((l) => l.paymentMethodId))];
          const found = await tx
            .select({ id: paymentMethods.id })
            .from(paymentMethods)
            .where(and(inArray(paymentMethods.id, ids), eq(paymentMethods.active, true)));
          if (found.length !== ids.length) throw new BadRequestException('Medio de pago inválido');
        }

        if (parking) {
          await tx
            .update(parkingSessions)
            .set({
              exitAt: parking.exitAt,
              minutes: parking.quote.totalMinutes,
              courtesyMinutes: parking.quote.courtesyMinutes,
              amount: parkingAmount,
            })
            .where(eq(parkingSessions.id, parking.sessionId));
        }

        const [payment] = await tx
          .insert(payments)
          .values({
            tenantId: auth.tenantId,
            branchId: order.branchId,
            shiftId: shift.id,
            workOrderId: order.id,
            number: await nextSequence(tx, order.branchId, 'PAYMENT'),
            servicesAmount,
            parkingAmount,
            subtotal,
            discount,
            total,
            discountReason: discount > 0 ? (input.discount?.reason ?? null) : null,
            discountAuthorizedBy: authorizedBy,
            createdBy: auth.userId,
          })
          .returning();
        if (input.lines.length) {
          await tx.insert(paymentLines).values(
            input.lines.map((l) => ({
              tenantId: auth.tenantId,
              paymentId: payment!.id,
              paymentMethodId: l.paymentMethodId,
              amount: l.amount,
              reference: l.reference ?? null,
            })),
          );
        }
        await tx.update(workOrders).set({ paidAt: now }).where(eq(workOrders.id, order.id));
        // Fase 2: aquí se generan las comisiones de los lavadores (SPEC regla 6).

        await this.audit.log(tx, auth, {
          entity: 'payment',
          entityId: payment!.id,
          branchId: order.branchId,
          action: 'CHARGE',
          after: {
            workOrderId: order.id,
            servicesAmount,
            parkingAmount,
            discount,
            total,
            lines: input.lines,
            authorizedBy,
          },
          reason: input.discount?.reason,
        });
        return payment!;
      }),
    );
  }

  /** Anular un pago (regla 9): inverso con motivo; la orden vuelve a quedar por cobrar. */
  async voidPayment(auth: AuthContext, paymentId: string, reason: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for('update');
      if (!payment) throw new NotFoundException('El pago no existe');
      if (payment.status !== 'PAID') throw new ConflictException('El pago ya está anulado');
      if (payment.workOrderId) {
        const [order] = await tx
          .select({ status: workOrders.status })
          .from(workOrders)
          .where(eq(workOrders.id, payment.workOrderId));
        if (order?.status === 'DELIVERED') {
          throw new ConflictException('No se puede anular el pago de una moto ya entregada');
        }
      }
      await tx
        .update(payments)
        .set({ status: 'VOIDED', voidedAt: new Date(), voidedBy: auth.userId, voidReason: reason })
        .where(eq(payments.id, paymentId));
      if (payment.workOrderId) {
        await tx
          .update(workOrders)
          .set({ paidAt: null })
          .where(eq(workOrders.id, payment.workOrderId));
        // El parqueo vuelve a correr hasta el nuevo cobro.
        await tx
          .update(parkingSessions)
          .set({ exitAt: null, minutes: null, courtesyMinutes: null, amount: null })
          .where(eq(parkingSessions.workOrderId, payment.workOrderId));
      }
      await this.audit.log(tx, auth, {
        entity: 'payment',
        entityId: paymentId,
        branchId: payment.branchId,
        action: 'VOID',
        before: { status: 'PAID', total: payment.total },
        after: { status: 'VOIDED' },
        reason,
      });
      return { status: 'VOIDED' as const };
    });
  }
}

// ----------------------------------------------------------------------
// Ayudantes
// ----------------------------------------------------------------------

async function openShiftOf(tx: Tx, auth: AuthContext) {
  const [shift] = await tx
    .select()
    .from(cashShifts)
    .where(and(eq(cashShifts.openedBy, auth.userId), eq(cashShifts.status, 'OPEN')))
    .limit(1);
  return shift ?? null;
}

async function ownOpenShift(tx: Tx, auth: AuthContext, shiftId: string) {
  const [shift] = await tx
    .select()
    .from(cashShifts)
    .where(eq(cashShifts.id, shiftId))
    .for('update');
  if (!shift) throw new NotFoundException('El turno no existe');
  if (shift.status !== 'OPEN') throw new ConflictException('El turno ya está cerrado');
  if (shift.openedBy !== auth.userId) throw new ForbiddenException('Este turno es de otro usuario');
  return shift;
}

type Shift = typeof cashShifts.$inferSelect;

async function shiftSummary(tx: Tx, shift: Shift) {
  const [cash] = await tx
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(eq(paymentMethods.type, 'CASH'))
    .orderBy(asc(paymentMethods.sortOrder))
    .limit(1);
  if (!cash) throw new BadRequestException('No hay un medio de pago en efectivo configurado');

  const [lines, movements, paymentsCount] = await Promise.all([
    tx
      .select({
        methodId: paymentLines.paymentMethodId,
        amount: paymentLines.amount,
        status: payments.status,
      })
      .from(paymentLines)
      .innerJoin(payments, eq(payments.id, paymentLines.paymentId))
      .where(eq(payments.shiftId, shift.id)),
    tx
      .select({ type: cashMovements.type, amount: cashMovements.amount })
      .from(cashMovements)
      .where(eq(cashMovements.shiftId, shift.id)),
    tx
      .select({ id: payments.id, status: payments.status, total: payments.total })
      .from(payments)
      .where(eq(payments.shiftId, shift.id)),
  ]);
  const expected = expectedByMethod({
    openingAmount: shift.openingAmount,
    cashMethodId: cash.id,
    lines: lines.map((l) => ({
      methodId: l.methodId,
      amount: l.amount,
      voided: l.status === 'VOIDED',
    })),
    movements,
  });
  const paid = paymentsCount.filter((p) => p.status === 'PAID');
  return {
    expected,
    cashMethodId: cash.id,
    payments: paid.length,
    voided: paymentsCount.length - paid.length,
    sales: paid.reduce((s, p) => s + p.total, 0),
    income: movements.filter((m) => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0),
    expenses: movements.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0),
  };
}

async function alertThreshold(tx: Tx, branchId: string) {
  const [branch] = await tx
    .select({ settings: branches.settings })
    .from(branches)
    .where(eq(branches.id, branchId));
  const v = (branch?.settings as { cashDifferenceAlert?: unknown } | undefined)
    ?.cashDifferenceAlert;
  return typeof v === 'number' ? v : DEFAULT_CASH_ALERT_THRESHOLD;
}

async function chargeableOrder(tx: Tx, orderId: string, lock = false) {
  const q = tx.select().from(workOrders).where(eq(workOrders.id, orderId));
  const [order] = lock ? await q.for('update') : await q;
  if (!order) throw new NotFoundException('La orden no existe');
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
    throw new ConflictException('La orden ya está cerrada');
  }
  if (order.paidAt) throw new ConflictException('Esta orden ya fue pagada');
  return order;
}

async function servicesTotal(tx: Tx, orderId: string) {
  const items = await tx
    .select({ price: workOrderItems.unitPrice })
    .from(workOrderItems)
    .where(and(eq(workOrderItems.workOrderId, orderId), ne(workOrderItems.status, 'CANCELLED')));
  return items.reduce((s, i) => s + i.price, 0);
}

async function discountLimitOf(tx: Tx, userId: string) {
  const rules = await tx
    .select({ maxPercent: discountRules.maxPercent, maxAmount: discountRules.maxAmount })
    .from(discountRules)
    .innerJoin(userBranchRoles, eq(userBranchRoles.roleId, discountRules.roleId))
    .where(eq(userBranchRoles.userId, userId));
  return effectiveLimit(
    rules.map((r) => ({ maxPercent: Number(r.maxPercent), maxAmount: r.maxAmount })),
  );
}

/** Verifica usuario + PIN de quien autoriza y que tenga `discounts.authorize`. */
async function verifyAuthorizer(tx: Tx, a: { username: string; pin: string }): Promise<string> {
  const [user] = await tx
    .select({ id: users.id, pinHash: users.pinHash })
    .from(users)
    .where(
      and(
        eq(users.username, a.username.toLowerCase()),
        eq(users.status, 'ACTIVE'),
        isNull(users.deletedAt),
      ),
    );
  const ok = user && (await verifyPin(a.pin, user.pinHash));
  if (!user || !ok) throw new ForbiddenException('Usuario o PIN de autorización incorrectos');
  const [perm] = await tx
    .select({ code: rolePermissions.permissionCode })
    .from(rolePermissions)
    .innerJoin(userBranchRoles, eq(userBranchRoles.roleId, rolePermissions.roleId))
    .where(
      and(
        eq(userBranchRoles.userId, user.id),
        eq(rolePermissions.permissionCode, PERMISSIONS.DISCOUNTS_AUTHORIZE),
      ),
    )
    .limit(1);
  if (!perm) throw new ForbiddenException('Ese usuario no puede autorizar descuentos');
  return user.id;
}
