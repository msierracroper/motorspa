import { Injectable } from '@nestjs/common';
import { ACTIVE_WORK_ORDER_STATUSES, normalizePlate } from '@motospa/shared';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth-context.js';
import { DbService } from '../db/db.service.js';
import { customerMotorcycles, customers, motorcycles, workOrders } from '../db/schema.js';

@Injectable()
export class CustomersService {
  constructor(private readonly db: DbService) {}

  /**
   * Búsqueda por placa para el check-in: la moto, sus clientes, su orden activa
   * y cuántas visitas lleva. `motorcycle: null` si la placa no existe.
   */
  async searchByPlate(auth: AuthContext, rawPlate: string) {
    const plate = normalizePlate(rawPlate);
    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, async (tx) => {
      const [moto] = await tx
        .select()
        .from(motorcycles)
        .where(and(eq(motorcycles.plate, plate), isNull(motorcycles.deletedAt)))
        .limit(1);
      if (!moto) return { plate, motorcycle: null, customers: [], activeOrder: null, visits: 0 };

      const [owners, [active], [stats]] = await Promise.all([
        tx
          .select({
            id: customers.id,
            fullName: customers.fullName,
            phone: customers.phone,
            relation: customerMotorcycles.relation,
          })
          .from(customerMotorcycles)
          .innerJoin(customers, eq(customers.id, customerMotorcycles.customerId))
          .where(and(eq(customerMotorcycles.motorcycleId, moto.id), isNull(customers.deletedAt))),
        tx
          .select({ id: workOrders.id, number: workOrders.number, status: workOrders.status })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.motorcycleId, moto.id),
              inArray(workOrders.status, [...ACTIVE_WORK_ORDER_STATUSES]),
            ),
          )
          .limit(1),
        tx
          .select({
            visits: sql<number>`count(*) filter (where ${workOrders.status} = 'DELIVERED')::int`,
            lastVisit: sql<string | null>`max(${workOrders.deliveredAt})`,
          })
          .from(workOrders)
          .where(eq(workOrders.motorcycleId, moto.id)),
      ]);

      return {
        plate,
        motorcycle: {
          id: moto.id,
          plate: moto.plate,
          brand: moto.brand,
          model: moto.model,
          cc: moto.cc,
          color: moto.color,
          notes: moto.notes,
        },
        customers: owners,
        activeOrder: active ?? null,
        visits: stats?.visits ?? 0,
        lastVisit: stats?.lastVisit ?? null,
      };
    });
  }

  /** Clientes por nombre, teléfono o placa (máx. 20). */
  async search(auth: AuthContext, q: string) {
    const term = q.trim();
    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
      tx
        .select({
          id: customers.id,
          fullName: customers.fullName,
          phone: customers.phone,
          plates: sql<
            string[]
          >`coalesce(array_agg(${motorcycles.plate}) filter (where ${motorcycles.id} is not null), '{}')`,
        })
        .from(customers)
        .leftJoin(customerMotorcycles, eq(customerMotorcycles.customerId, customers.id))
        .leftJoin(motorcycles, eq(motorcycles.id, customerMotorcycles.motorcycleId))
        .where(
          and(
            isNull(customers.deletedAt),
            term
              ? or(
                  ilike(customers.fullName, `%${term}%`),
                  ilike(customers.phone, `%${term.replace(/\D/g, '') || term}%`),
                  ilike(motorcycles.plate, `%${normalizePlate(term) || term}%`),
                )
              : undefined,
          ),
        )
        .groupBy(customers.id)
        .orderBy(customers.fullName)
        .limit(20),
    );
  }

  /** Historial de una moto: sus últimas 20 órdenes. */
  async history(auth: AuthContext, motorcycleId: string) {
    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
      tx
        .select({
          id: workOrders.id,
          number: workOrders.number,
          type: workOrders.type,
          status: workOrders.status,
          checkedInAt: workOrders.checkedInAt,
          deliveredAt: workOrders.deliveredAt,
        })
        .from(workOrders)
        .where(eq(workOrders.motorcycleId, motorcycleId))
        .orderBy(desc(workOrders.checkedInAt))
        .limit(20),
    );
  }
}
