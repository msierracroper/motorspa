/**
 * Descuentos (SPEC §4.9 y regla 8). Dinero en enteros COP.
 * Un descuento por encima del límite del rol requiere autorización de un
 * usuario con el permiso `discounts.authorize` (se registra quién autorizó).
 */

export type DiscountType = 'PERCENT' | 'AMOUNT';

export interface DiscountInput {
  type: DiscountType;
  /** Porcentaje (0–100) o valor en pesos. */
  value: number;
}

export interface DiscountLimit {
  maxPercent: number;
  /** Tope en pesos; null = sin tope en pesos. */
  maxAmount: number | null;
}

/** Valor del descuento en pesos, redondeado al peso y nunca mayor al subtotal. */
export function discountAmount(subtotal: number, discount: DiscountInput | null): number {
  if (!discount || discount.value <= 0 || subtotal <= 0) return 0;
  const raw =
    discount.type === 'PERCENT'
      ? Math.round((subtotal * Math.min(discount.value, 100)) / 100)
      : Math.round(discount.value);
  return Math.min(raw, subtotal);
}

/** El límite más permisivo entre los roles del usuario (sin roles: no puede descontar). */
export function effectiveLimit(limits: readonly DiscountLimit[]): DiscountLimit {
  if (limits.length === 0) return { maxPercent: 0, maxAmount: 0 };
  return {
    maxPercent: Math.max(...limits.map((l) => l.maxPercent)),
    maxAmount: limits.some((l) => l.maxAmount === null)
      ? null
      : Math.max(...limits.map((l) => l.maxAmount as number)),
  };
}

/** true si el descuento supera el límite y necesita autorización. */
export function requiresAuthorization(
  subtotal: number,
  amount: number,
  limit: DiscountLimit,
): boolean {
  if (amount <= 0) return false;
  if (subtotal <= 0) return true;
  const percent = (amount / subtotal) * 100;
  return (
    percent > limit.maxPercent + 1e-9 || (limit.maxAmount !== null && amount > limit.maxAmount)
  );
}
