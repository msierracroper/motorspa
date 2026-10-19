import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@motospa/shared';
import { and, eq, gte, inArray, lt, ne, sql, type SQL } from 'drizzle-orm';
import { branchOf, type AuthContext } from '../auth/auth-context.js';
import { DbService } from '../db/db.service.js';
import {
  cashShifts,
  paymentLines,
  paymentMethods,
  payments,
  users,
  workOrderItems,
  workOrders,
} from '../db/schema.js';

/** Inicio y fin del día en hora de Colombia (UTC−5 fijo). */
export function colombiaDayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00-05:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService) {}

  /** Reporte del día: órdenes, ventas por medio y por servicio, y cierres de caja. */
  async daily(auth: AuthContext, date: string) {
    const branchId = branchOf(auth);
    const { from, to } = colombiaDayRange(date);
    // El cajero solo ve lo de sus propios turnos (SPEC §8: "Parcial (su turno)").
    const ownOnly =
      !auth.permissions.includes(PERMISSIONS.REPORTS_OPERATIONS) &&
      !auth.permissions.includes(PERMISSIONS.REPORTS_FINANCE);

    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, async (tx) => {
      const paidInDay: SQL[] = [
        eq(payments.branchId, branchId),
        eq(payments.status, 'PAID'),
        gte(payments.createdAt, from),
        lt(payments.createdAt, to),
      ];
      if (ownOnly) paidInDay.push(eq(payments.createdBy, auth.userId));

      const [orders, [sales], byMethod, paidOrderIds, shifts] = await Promise.all([
        tx
          .select({
            type: workOrders.type,
            checkedIn: sql<number>`count(*)::int`,
            delivered: sql<number>`count(*) filter (where ${workOrders.status} = 'DELIVERED')::int`,
            cancelled: sql<number>`count(*) filter (where ${workOrders.status} = 'CANCELLED')::int`,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.branchId, branchId),
              gte(workOrders.checkedInAt, from),
              lt(workOrders.checkedInAt, to),
            ),
          )
          .groupBy(workOrders.type),
        tx
          .select({
            count: sql<number>`count(*)::int`,
            total: sql<number>`coalesce(sum(${payments.total}), 0)::int`,
            services: sql<number>`coalesce(sum(${payments.servicesAmount}), 0)::int`,
            parking: sql<number>`coalesce(sum(${payments.parkingAmount}), 0)::int`,
            discounts: sql<number>`coalesce(sum(${payments.discount}), 0)::int`,
          })
          .from(payments)
          .where(and(...paidInDay)),
        tx
          .select({
            methodId: paymentMethods.id,
            method: paymentMethods.name,
            total: sql<number>`coalesce(sum(${paymentLines.amount}), 0)::int`,
          })
          .from(paymentLines)
          .innerJoin(payments, eq(payments.id, paymentLines.paymentId))
          .innerJoin(paymentMethods, eq(paymentMethods.id, paymentLines.paymentMethodId))
          .where(and(...paidInDay))
          .groupBy(paymentMethods.id, paymentMethods.name, paymentMethods.sortOrder)
          .orderBy(paymentMethods.sortOrder),
        tx
          .select({ id: payments.workOrderId })
          .from(payments)
          .where(and(...paidInDay)),
        tx
          .select({
            id: cashShifts.id,
            status: cashShifts.status,
            openedAt: cashShifts.openedAt,
            closedAt: cashShifts.closedAt,
            openingAmount: cashShifts.openingAmount,
            difference: cashShifts.difference,
            cashier: users.fullName,
          })
          .from(cashShifts)
          .innerJoin(users, eq(users.id, cashShifts.openedBy))
          .where(
            and(
              eq(cashShifts.branchId, branchId),
              gte(cashShifts.openedAt, from),
              lt(cashShifts.openedAt, to),
              ...(ownOnly ? [eq(cashShifts.openedBy, auth.userId)] : []),
            ),
          )
          .orderBy(cashShifts.openedAt),
      ]);

      const ids = paidOrderIds.map((p) => p.id).filter((id): id is string => id !== null);
      const byService = ids.length
        ? await tx
            .select({
              service: workOrderItems.description,
              count: sql<number>`count(*)::int`,
              total: sql<number>`sum(${workOrderItems.unitPrice})::int`,
            })
            .from(workOrderItems)
            .where(
              and(inArray(workOrderItems.workOrderId, ids), ne(workOrderItems.status, 'CANCELLED')),
            )
            .groupBy(workOrderItems.description)
            .orderBy(sql`sum(${workOrderItems.unitPrice}) desc`)
        : [];

      return {
        date,
        scope: ownOnly ? ('OWN_SHIFTS' as const) : ('BRANCH' as const),
        orders,
        sales: sales ?? { count: 0, total: 0, services: 0, parking: 0, discounts: 0 },
        byMethod,
        byService,
        shifts,
      };
    });
  }
}
