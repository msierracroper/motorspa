import { Injectable } from '@nestjs/common';
import { priceForCc, type PriceRange } from '@motospa/shared';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { branchOf, type AuthContext } from '../auth/auth-context.js';
import type { Tx } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import { serviceCategories, servicePrices, services } from '../db/schema.js';

export interface CatalogService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  estimatedMinutes: number;
  prices: PriceRange[];
}

@Injectable()
export class CatalogServiceRepo {
  constructor(private readonly db: DbService) {}

  async list(auth: AuthContext): Promise<CatalogService[]> {
    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
      loadServices(tx, branchOf(auth)),
    );
  }
}

/** Servicios activos con sus precios (de la sede o generales), ordenados para el check-in. */
export async function loadServices(
  tx: Tx,
  branchId: string,
  ids?: string[],
): Promise<CatalogService[]> {
  const rows = await tx
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      category: serviceCategories.name,
      estimatedMinutes: services.estimatedMinutes,
      ccMin: servicePrices.ccMin,
      ccMax: servicePrices.ccMax,
      price: servicePrices.price,
    })
    .from(services)
    .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .leftJoin(
      servicePrices,
      and(
        eq(servicePrices.serviceId, services.id),
        or(isNull(servicePrices.branchId), eq(servicePrices.branchId, branchId)),
      ),
    )
    .where(and(eq(services.active, true), isNull(services.deletedAt)))
    .orderBy(asc(services.sortOrder), asc(services.name), asc(servicePrices.ccMin));

  const byId = new Map<string, CatalogService>();
  for (const r of rows) {
    if (ids && !ids.includes(r.id)) continue;
    let s = byId.get(r.id);
    if (!s) {
      s = {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        estimatedMinutes: r.estimatedMinutes,
        prices: [],
      };
      byId.set(r.id, s);
    }
    if (r.price !== null) s.prices.push({ ccMin: r.ccMin, ccMax: r.ccMax, price: r.price });
  }
  return [...byId.values()];
}

/** Precio de un servicio para una moto; error claro si el servicio no tiene precio. */
export function priceOf(service: CatalogService, cc: number | null): number {
  const price = priceForCc(service.prices, cc);
  if (price === null) throw new Error(`El servicio "${service.name}" no tiene precio configurado`);
  return price;
}
