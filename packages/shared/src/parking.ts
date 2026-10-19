/**
 * Cálculo del cobro de parqueo (SPEC regla 7). Orden de aplicación:
 * mensualidad vigente → cortesía por lavado → tiempo de gracia → tarifa
 * (fracción redondeada hacia arriba) → tarifa nocturna → tope por cada 24 h.
 *
 * Dinero en enteros COP. Hora local de Colombia: UTC−5 fijo (sin horario de verano).
 */

export type ParkingMode = 'MINUTE' | 'FRACTION' | 'HOUR' | 'DAY';

export interface ParkingRate {
  mode: ParkingMode;
  /** Minutos por fracción (solo modo FRACTION). */
  fractionMinutes: number | null;
  /** Precio por unidad (minuto, fracción, hora o día). */
  pricePerUnit: number;
  /** Si la estadía cobrable total no supera estos minutos, es gratis. */
  graceMinutes: number;
  /** Máximo a cobrar por cada bloque de 24 h desde el inicio del cobro. */
  dailyCap: number | null;
  /** Franja nocturna en hora local "HH:MM" (puede cruzar la medianoche). */
  nightStart: string | null;
  nightEnd: string | null;
  /** Precio por unidad que inicia dentro de la franja nocturna. */
  nightPrice: number | null;
}

export interface ParkingQuoteInput {
  entryAt: Date;
  exitAt: Date;
  rate: ParkingRate;
  /** Fin de la cortesía por lavado (moto lista + minutos de cortesía). */
  courtesyUntil?: Date | null;
  hasMonthlyPlan?: boolean;
}

export type ParkingQuoteReason = 'MONTHLY_PLAN' | 'COURTESY' | 'GRACE' | 'CHARGED';

export interface ParkingQuote {
  amount: number;
  /** Minutos totales de estadía (entrada → salida). */
  totalMinutes: number;
  /** Minutos cubiertos por la cortesía de lavado. */
  courtesyMinutes: number;
  /** Minutos sujetos a cobro (después de la cortesía). */
  billableMinutes: number;
  units: number;
  reason: ParkingQuoteReason;
}

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
const COLOMBIA_OFFSET_MINUTES = -5 * 60;

export function unitMinutes(rate: Pick<ParkingRate, 'mode' | 'fractionMinutes'>): number {
  switch (rate.mode) {
    case 'MINUTE':
      return 1;
    case 'FRACTION':
      if (!rate.fractionMinutes || rate.fractionMinutes <= 0) {
        throw new Error('La tarifa por fracción necesita fractionMinutes > 0');
      }
      return rate.fractionMinutes;
    case 'HOUR':
      return 60;
    case 'DAY':
      return DAY_MINUTES;
  }
}

function parseHHMM(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`Hora inválida: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minuto del día en hora de Colombia (0–1439). */
export function colombiaMinuteOfDay(date: Date): number {
  const utc = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (((utc + COLOMBIA_OFFSET_MINUTES) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

export function isNight(date: Date, nightStart: string, nightEnd: string): boolean {
  const t = colombiaMinuteOfDay(date);
  const start = parseHHMM(nightStart);
  const end = parseHHMM(nightEnd);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.ceil((b.getTime() - a.getTime()) / MINUTE_MS));

export function quoteParking(input: ParkingQuoteInput): ParkingQuote {
  const { entryAt, exitAt, rate } = input;
  if (exitAt.getTime() < entryAt.getTime()) throw new Error('La salida es anterior a la entrada');

  const totalMinutes = minutesBetween(entryAt, exitAt);
  const base = { totalMinutes, courtesyMinutes: 0, billableMinutes: 0, units: 0, amount: 0 };

  // 1. Mensualidad vigente
  if (input.hasMonthlyPlan) return { ...base, reason: 'MONTHLY_PLAN' };

  // 2. Cortesía por lavado: el cobro arranca cuando termina la cortesía
  let start = entryAt;
  if (input.courtesyUntil && input.courtesyUntil.getTime() > entryAt.getTime()) {
    start = new Date(Math.min(input.courtesyUntil.getTime(), exitAt.getTime()));
  }
  const courtesyMinutes = minutesBetween(entryAt, start);
  const billableMinutes = minutesBetween(start, exitAt);
  if (billableMinutes === 0) {
    return { ...base, courtesyMinutes, reason: courtesyMinutes > 0 ? 'COURTESY' : 'GRACE' };
  }

  // 3. Gracia (D-5): estadía cobrable dentro de la gracia → gratis; si la supera, se cobra todo
  if (billableMinutes <= rate.graceMinutes) {
    return { ...base, courtesyMinutes, billableMinutes, reason: 'GRACE' };
  }

  // 4–6. Unidades redondeadas hacia arriba, precio nocturno por unidad y tope por bloque de 24 h
  const unit = unitMinutes(rate);
  const hasNight = rate.nightStart !== null && rate.nightEnd !== null && rate.nightPrice !== null;
  let amount = 0;
  let units = 0;
  for (let blockStart = 0; blockStart < billableMinutes; blockStart += DAY_MINUTES) {
    const blockMinutes = Math.min(DAY_MINUTES, billableMinutes - blockStart);
    const blockUnits = Math.ceil(blockMinutes / unit);
    let blockAmount = 0;
    for (let i = 0; i < blockUnits; i++) {
      const unitStart = new Date(start.getTime() + (blockStart + i * unit) * MINUTE_MS);
      const night = hasNight && isNight(unitStart, rate.nightStart!, rate.nightEnd!);
      blockAmount += night ? rate.nightPrice! : rate.pricePerUnit;
    }
    if (rate.dailyCap !== null) blockAmount = Math.min(blockAmount, rate.dailyCap);
    amount += blockAmount;
    units += blockUnits;
  }

  return { totalMinutes, courtesyMinutes, billableMinutes, units, amount, reason: 'CHARGED' };
}
