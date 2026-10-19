/**
 * Caja: valor esperado por medio de pago y arqueo al cierre (SPEC §4.9).
 * Dinero en enteros COP. Los pagos anulados no cuentan.
 */

export interface PaymentLineSummary {
  methodId: string;
  amount: number;
  voided?: boolean;
}

export interface CashMovementSummary {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
}

export interface ExpectedInput {
  openingAmount: number;
  cashMethodId: string;
  lines: readonly PaymentLineSummary[];
  /** Movimientos manuales de caja (siempre en efectivo). */
  movements: readonly CashMovementSummary[];
}

export type AmountsByMethod = Record<string, number>;

export function expectedByMethod(input: ExpectedInput): AmountsByMethod {
  const expected: AmountsByMethod = { [input.cashMethodId]: input.openingAmount };
  for (const line of input.lines) {
    if (line.voided) continue;
    expected[line.methodId] = (expected[line.methodId] ?? 0) + line.amount;
  }
  for (const m of input.movements) {
    expected[input.cashMethodId] =
      (expected[input.cashMethodId] ?? 0) + (m.type === 'INCOME' ? m.amount : -m.amount);
  }
  return expected;
}

export interface ArqueoResult {
  /** contado − esperado por medio (positivo = sobrante, negativo = faltante). */
  differenceByMethod: AmountsByMethod;
  totalExpected: number;
  totalCounted: number;
  totalDifference: number;
}

export function arqueo(expected: AmountsByMethod, counted: AmountsByMethod): ArqueoResult {
  const methods = new Set([...Object.keys(expected), ...Object.keys(counted)]);
  const differenceByMethod: AmountsByMethod = {};
  let totalExpected = 0;
  let totalCounted = 0;
  for (const m of methods) {
    const e = expected[m] ?? 0;
    const c = counted[m] ?? 0;
    differenceByMethod[m] = c - e;
    totalExpected += e;
    totalCounted += c;
  }
  return {
    differenceByMethod,
    totalExpected,
    totalCounted,
    totalDifference: totalCounted - totalExpected,
  };
}

/** Billetes y monedas colombianos para el conteo por denominación (opcional). */
export const COP_DENOMINATIONS = [
  100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
] as const;

export function sumDenominations(counts: Partial<Record<number, number>>): number {
  return Object.entries(counts).reduce((sum, [den, qty]) => sum + Number(den) * (qty ?? 0), 0);
}

/** Verifica que los pagos mixtos cubran exactamente el total. */
export function paymentLinesCover(total: number, lines: readonly { amount: number }[]): boolean {
  return (
    lines.every((l) => Number.isInteger(l.amount) && l.amount > 0) &&
    lines.reduce((s, l) => s + l.amount, 0) === total
  );
}
