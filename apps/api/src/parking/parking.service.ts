import { Injectable, NotFoundException } from '@nestjs/common';
import { quoteParking, type ParkingQuote, type ParkingRate } from '@motospa/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { branchOf, type AuthContext } from '../auth/auth-context.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  motorcycles,
  parkingRates,
  parkingSessions,
  parkingSpots,
  workOrders,
} from '../db/schema.js';

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function toRate(r: typeof parkingRates.$inferSelect): ParkingRate {
  return {
    mode: r.mode,
    fractionMinutes: r.fractionMinutes,
    pricePerUnit: r.pricePerUnit,
    graceMinutes: r.graceMinutes,
    dailyCap: r.dailyCap,
    nightStart: hhmm(r.nightStart),
    nightEnd: hhmm(r.nightEnd),
    nightPrice: r.nightPrice,
  };
}

export interface OrderParking {
  sessionId: string;
  quote: ParkingQuote;
  entryAt: Date;
  exitAt: Date;
  courtesyUntil: Date | null;
}

/**
 * Cotiza el parqueo de una orden a la hora `at` (SPEC regla 7). La cortesía por
 * lavado cubre el servicio y `courtesy_minutes` después de quedar lista (D-4).
 * `null` si la orden no tiene parqueo.
 */
export async function quoteOrderParking(
  tx: Tx,
  orderId: string,
  at = new Date(),
): Promise<OrderParking | null> {
  const [row] = await tx
    .select({ session: parkingSessions, rate: parkingRates, order: workOrders })
    .from(parkingSessions)
    .innerJoin(parkingRates, eq(parkingRates.id, parkingSessions.rateId))
    .innerJoin(workOrders, eq(workOrders.id, parkingSessions.workOrderId))
    .where(eq(parkingSessions.workOrderId, orderId))
    .limit(1);
  if (!row) return null;

  const exitAt = row.session.exitAt ?? at;
  let courtesyUntil: Date | null = null;
  if (row.order.type === 'WASH_PARKING') {
    // Si aún no está lista, la cortesía sigue corriendo hasta ahora.
    const readyAt = row.order.readyAt ?? exitAt;
    courtesyUntil = new Date(readyAt.getTime() + row.rate.courtesyMinutes * 60_000);
  }
  const quote = quoteParking({
    entryAt: row.session.entryAt,
    exitAt,
    rate: toRate(row.rate),
    courtesyUntil,
    hasMonthlyPlan: row.session.monthlyPlanId !== null, // Fase 2: validar vigencia
  });
  return { sessionId: row.session.id, quote, entryAt: row.session.entryAt, exitAt, courtesyUntil };
}

@Injectable()
export class ParkingService {
  constructor(private readonly db: DbService) {}

  private scope(auth: AuthContext) {
    return { tenantId: auth.tenantId, userId: auth.userId };
  }

  async quote(auth: AuthContext, orderId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const q = await quoteOrderParking(tx, orderId);
      if (!q) throw new NotFoundException('Esta orden no tiene parqueo');
      return q;
    });
  }

  /** Tarifa activa de la sede (para mostrarla en recepción). */
  async activeRate(auth: AuthContext) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const [rate] = await tx
        .select()
        .from(parkingRates)
        .where(and(eq(parkingRates.branchId, branchOf(auth)), eq(parkingRates.active, true)))
        .limit(1);
      return rate
        ? { ...rate, nightStart: hhmm(rate.nightStart), nightEnd: hhmm(rate.nightEnd) }
        : null;
    });
  }

  /** Ocupación: cupos con la moto que los ocupa y motos parqueadas sin cupo. */
  async occupancy(auth: AuthContext) {
    const branchId = branchOf(auth);
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const [spots, open] = await Promise.all([
        tx
          .select({ id: parkingSpots.id, code: parkingSpots.code })
          .from(parkingSpots)
          .where(and(eq(parkingSpots.branchId, branchId), eq(parkingSpots.active, true)))
          .orderBy(asc(parkingSpots.code)),
        tx
          .select({
            sessionId: parkingSessions.id,
            spotId: parkingSessions.spotId,
            entryAt: parkingSessions.entryAt,
            workOrderId: workOrders.id,
            number: workOrders.number,
            status: workOrders.status,
            plate: motorcycles.plate,
          })
          .from(parkingSessions)
          .innerJoin(workOrders, eq(workOrders.id, parkingSessions.workOrderId))
          .innerJoin(motorcycles, eq(motorcycles.id, workOrders.motorcycleId))
          .where(and(eq(parkingSessions.branchId, branchId), isNull(parkingSessions.exitAt)))
          .orderBy(asc(parkingSessions.entryAt)),
      ]);
      return {
        spots: spots.map((s) => ({
          ...s,
          occupiedBy: open.find((o) => o.spotId === s.id) ?? null,
        })),
        withoutSpot: open.filter((o) => o.spotId === null),
        totalSpots: spots.length,
        occupied: open.filter((o) => o.spotId !== null).length,
        parked: open.length,
      };
    });
  }
}
