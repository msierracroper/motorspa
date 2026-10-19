import { sql } from 'drizzle-orm';
import type { Tx } from './db.service.js';

export type SequenceType = 'WORK_ORDER' | 'PAYMENT';

/**
 * Siguiente consecutivo de la sede (SPEC regla 10). Corre en la transacción del
 * llamador: si se revierte, el número no se consume (sin huecos).
 */
export async function nextSequence(tx: Tx, branchId: string, type: SequenceType): Promise<number> {
  const res = (await tx.execute(
    sql`select app.next_sequence(${branchId}::uuid, ${type}) as n`,
  )) as unknown;
  // postgres.js devuelve un arreglo de filas; PGlite (pruebas) devuelve { rows }.
  const rows = Array.isArray(res) ? res : (res as { rows: unknown[] }).rows;
  return Number((rows[0] as { n: string | number }).n);
}
