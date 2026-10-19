import type { PermissionCode } from '@motospa/shared';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/app/currentUser';

/** Hora actual que se actualiza cada `intervalMs` (cronómetros, tiempos de espera). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useCan(...anyOf: PermissionCode[]): boolean {
  const me = useCurrentUser();
  return anyOf.some((p) => me.permissions.includes(p));
}

/** "hace 12 min", "1 h 05 min". */
export function formatElapsed(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Fecha y hora en Colombia. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Fecha de hoy en Colombia como AAAA-MM-DD. */
export function todayInColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
