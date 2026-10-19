import { describe, expect, it } from 'vitest';
import { arqueo, expectedByMethod, paymentLinesCover, sumDenominations } from './cash.js';
import { discountAmount, effectiveLimit, requiresAuthorization } from './discounts.js';
import { formatCOP, isColombianMotoPlate, isValidPlate, normalizePlate } from './format.js';
import { canTransition, deriveStatus, priceForCc } from './work-order.js';

describe('descuentos (regla 8)', () => {
  it('calcula porcentaje redondeado y nunca supera el subtotal', () => {
    expect(discountAmount(27000, { type: 'PERCENT', value: 10 })).toBe(2700);
    expect(discountAmount(12345, { type: 'PERCENT', value: 15 })).toBe(1852);
    expect(discountAmount(10000, { type: 'AMOUNT', value: 15000 })).toBe(10000);
    expect(discountAmount(10000, null)).toBe(0);
  });

  it('límite del cajero: 10 % y máx. $5.000 (D-7)', () => {
    const cajero = { maxPercent: 10, maxAmount: 5000 };
    expect(requiresAuthorization(27000, 2700, cajero)).toBe(false);
    expect(requiresAuthorization(27000, 2800, cajero)).toBe(true);
    expect(requiresAuthorization(80000, 6000, cajero)).toBe(true); // 7,5 % pero > $5.000
  });

  it('toma el límite más permisivo entre roles', () => {
    expect(
      effectiveLimit([
        { maxPercent: 10, maxAmount: 5000 },
        { maxPercent: 30, maxAmount: null },
      ]),
    ).toEqual({
      maxPercent: 30,
      maxAmount: null,
    });
    expect(effectiveLimit([])).toEqual({ maxPercent: 0, maxAmount: 0 });
  });
});

describe('orden de trabajo (SPEC §7)', () => {
  it('deriva el estado de los ítems', () => {
    expect(deriveStatus('RECEIVED', [])).toBe('READY'); // solo parqueo
    expect(deriveStatus('QUEUED', ['PENDING', 'PENDING'])).toBe('QUEUED');
    expect(deriveStatus('QUEUED', ['IN_PROGRESS', 'PENDING'])).toBe('IN_PROGRESS');
    expect(deriveStatus('IN_PROGRESS', ['DONE', 'PENDING'])).toBe('IN_PROGRESS');
    expect(deriveStatus('IN_PROGRESS', ['DONE', 'CANCELLED'])).toBe('READY');
    expect(deriveStatus('DELIVERED', ['PENDING'])).toBe('DELIVERED');
  });

  it('valida transiciones', () => {
    expect(canTransition('READY', 'DELIVERED')).toBe(true);
    expect(canTransition('QUEUED', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('elige el precio por rango de cilindraje (D-1)', () => {
    const prices = [
      { ccMin: null, ccMax: 150, price: 12000 },
      { ccMin: 151, ccMax: 400, price: 15000 },
      { ccMin: 401, ccMax: null, price: 20000 },
    ];
    expect(priceForCc(prices, 125)).toBe(12000);
    expect(priceForCc(prices, 150)).toBe(12000);
    expect(priceForCc(prices, 151)).toBe(15000);
    expect(priceForCc(prices, 1200)).toBe(20000);
    expect(priceForCc(prices, null)).toBe(12000);
    expect(priceForCc([{ ccMin: null, ccMax: null, price: 8000 }], 650)).toBe(8000);
  });
});

describe('caja y arqueo (SPEC §4.9)', () => {
  const CASH = 'cash';
  it('esperado = base + pagos no anulados + ingresos − egresos', () => {
    const expected = expectedByMethod({
      openingAmount: 100000,
      cashMethodId: CASH,
      lines: [
        { methodId: CASH, amount: 27000 },
        { methodId: 'nequi', amount: 15000 },
        { methodId: CASH, amount: 9000, voided: true },
      ],
      movements: [
        { type: 'EXPENSE', amount: 20000 },
        { type: 'INCOME', amount: 5000 },
      ],
    });
    expect(expected).toEqual({ cash: 112000, nequi: 15000 });
  });

  it('arqueo con faltante y sobrante', () => {
    const r = arqueo({ cash: 112000, nequi: 15000 }, { cash: 110000, nequi: 15000, card: 1000 });
    expect(r.differenceByMethod).toEqual({ cash: -2000, nequi: 0, card: 1000 });
    expect(r.totalDifference).toBe(-1000);
  });

  it('pagos mixtos deben cubrir exactamente el total con enteros positivos', () => {
    expect(paymentLinesCover(27000, [{ amount: 20000 }, { amount: 7000 }])).toBe(true);
    expect(paymentLinesCover(27000, [{ amount: 20000 }])).toBe(false);
    expect(paymentLinesCover(27000, [{ amount: 27000.5 }])).toBe(false);
    expect(paymentLinesCover(27000, [{ amount: 30000 }, { amount: -3000 }])).toBe(false);
  });

  it('suma el conteo por denominación', () => {
    expect(sumDenominations({ 50000: 2, 10000: 1, 500: 3 })).toBe(111500);
  });
});

describe('formatos', () => {
  it('pesos colombianos', () => {
    expect(formatCOP(27000)).toBe('$27.000');
    expect(formatCOP(1250000)).toBe('$1.250.000');
    expect(formatCOP(-2000)).toBe('-$2.000');
    expect(formatCOP(0)).toBe('$0');
  });

  it('placas', () => {
    expect(normalizePlate(' kxt-45f ')).toBe('KXT45F');
    expect(isColombianMotoPlate('kxt 45f')).toBe(true);
    expect(isColombianMotoPlate('ABC123')).toBe(false);
    expect(isValidPlate('ABC123')).toBe(true);
    expect(isValidPlate('A1')).toBe(false);
  });
});
