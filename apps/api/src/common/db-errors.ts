import { ConflictException, HttpException } from '@nestjs/common';

/** Mensajes para las restricciones de la base que el usuario puede provocar. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  work_orders_one_active_per_moto: 'Esta moto ya tiene una orden activa',
  cash_shifts_one_open: 'Esta caja ya tiene un turno abierto',
  parking_sessions_spot_occupied: 'Ese cupo ya está ocupado',
  payments_one_paid_per_order: 'Esta orden ya fue pagada',
  motorcycles_tenant_id_plate_key: 'Ya existe una moto con esa placa',
};

interface PgLikeError {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  cause?: unknown;
}

/** Convierte violaciones de restricciones conocidas en 409 con un mensaje claro. */
export function mapDbError(err: unknown): unknown {
  if (err instanceof HttpException) return err;
  let e = err as PgLikeError | undefined;
  // Drizzle envuelve el error del driver en `cause`.
  for (let i = 0; i < 3 && e && !e.code && e.cause; i++) e = e.cause as PgLikeError;
  const constraint = e?.constraint ?? e?.constraint_name;
  if (e?.code === '23505' && constraint && CONSTRAINT_MESSAGES[constraint]) {
    return new ConflictException(CONSTRAINT_MESSAGES[constraint]);
  }
  return err;
}

export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapDbError(err);
  }
}
