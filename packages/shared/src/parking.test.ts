import { describe, expect, it } from 'vitest';
import { colombiaMinuteOfDay, isNight, quoteParking, type ParkingRate } from './parking.js';

/** Tarifa demo D-3: fracción 30 min $1.000, gracia 10, nocturna 19–06 $1.500, tope $12.000. */
const RATE: ParkingRate = {
  mode: 'FRACTION',
  fractionMinutes: 30,
  pricePerUnit: 1000,
  graceMinutes: 10,
  dailyCap: 12000,
  nightStart: '19:00',
  nightEnd: '06:00',
  nightPrice: 1500,
};

/** Fecha en hora de Colombia (UTC−5). */
const co = (iso: string) => new Date(`${iso}-05:00`);

describe('hora local de Colombia', () => {
  it('convierte UTC a UTC−5', () => {
    expect(colombiaMinuteOfDay(new Date('2026-10-20T00:30:00Z'))).toBe(19 * 60 + 30);
    expect(colombiaMinuteOfDay(co('2026-10-20T06:00:00'))).toBe(6 * 60);
  });

  it('la franja nocturna cruza la medianoche', () => {
    expect(isNight(co('2026-10-20T23:00:00'), '19:00', '06:00')).toBe(true);
    expect(isNight(co('2026-10-20T05:59:00'), '19:00', '06:00')).toBe(true);
    expect(isNight(co('2026-10-20T06:00:00'), '19:00', '06:00')).toBe(false);
    expect(isNight(co('2026-10-20T18:59:00'), '19:00', '06:00')).toBe(false);
  });
});

describe('quoteParking', () => {
  it('dentro de la gracia es gratis', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T10:10:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 0, reason: 'GRACE', billableMinutes: 10 });
  });

  it('al superar la gracia se cobra desde el inicio, fracción hacia arriba', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T10:11:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 1000, units: 1, reason: 'CHARGED' });
  });

  it('61 minutos de día son 3 fracciones', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T11:01:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 3000, units: 3 });
  });

  it('cobra tarifa nocturna en las fracciones que inician de noche', () => {
    // 18:30–19:30 → 18:30 (día $1.000) + 19:00 (noche $1.500)
    const q = quoteParking({
      entryAt: co('2026-10-20T18:30:00'),
      exitAt: co('2026-10-20T19:30:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 2500, units: 2 });
  });

  it('aplica el tope por cada 24 h', () => {
    // 10 horas de día = 20 fracciones × $1.000 = $20.000 → tope $12.000
    const q = quoteParking({
      entryAt: co('2026-10-20T07:00:00'),
      exitAt: co('2026-10-20T17:00:00'),
      rate: RATE,
    });
    expect(q.amount).toBe(12000);
  });

  it('una estadía de 24 h + 1 min es un tope más una fracción', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T08:00:00'),
      exitAt: co('2026-10-21T08:01:00'),
      rate: RATE,
    });
    expect(q.amount).toBe(12000 + 1000);
  });

  it('la cortesía de lavado no se cobra y el cobro arranca al terminarla', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T11:40:00'),
      courtesyUntil: co('2026-10-20T11:00:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({
      courtesyMinutes: 60,
      billableMinutes: 40,
      amount: 2000,
      reason: 'CHARGED',
    });
  });

  it('si sale dentro de la cortesía no paga', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T10:50:00'),
      courtesyUntil: co('2026-10-20T11:00:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 0, reason: 'COURTESY', courtesyMinutes: 50 });
  });

  it('la gracia se cuenta después de la cortesía', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T10:00:00'),
      exitAt: co('2026-10-20T11:08:00'),
      courtesyUntil: co('2026-10-20T11:00:00'),
      rate: RATE,
    });
    expect(q).toMatchObject({ amount: 0, reason: 'GRACE', billableMinutes: 8 });
  });

  it('con mensualidad vigente no se cobra nada', () => {
    const q = quoteParking({
      entryAt: co('2026-10-20T07:00:00'),
      exitAt: co('2026-10-22T07:00:00'),
      rate: RATE,
      hasMonthlyPlan: true,
    });
    expect(q).toMatchObject({ amount: 0, reason: 'MONTHLY_PLAN' });
  });

  it('modo por hora y por día', () => {
    const hourly: ParkingRate = {
      ...RATE,
      mode: 'HOUR',
      fractionMinutes: null,
      pricePerUnit: 2000,
      nightPrice: null,
      dailyCap: null,
    };
    expect(
      quoteParking({
        entryAt: co('2026-10-20T10:00:00'),
        exitAt: co('2026-10-20T12:30:00'),
        rate: hourly,
      }).amount,
    ).toBe(6000);
    const daily: ParkingRate = { ...hourly, mode: 'DAY', pricePerUnit: 8000 };
    expect(
      quoteParking({
        entryAt: co('2026-10-20T10:00:00'),
        exitAt: co('2026-10-21T11:00:00'),
        rate: daily,
      }).amount,
    ).toBe(16000);
  });

  it('rechaza una salida anterior a la entrada', () => {
    expect(() =>
      quoteParking({
        entryAt: co('2026-10-20T10:00:00'),
        exitAt: co('2026-10-20T09:00:00'),
        rate: RATE,
      }),
    ).toThrow();
  });
});
