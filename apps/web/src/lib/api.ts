import 'server-only';
import type { PermissionCode } from '@motospa/shared';
import { cacheLife, io } from 'next/cache';
import { cache } from 'react';
import { createClient } from './supabase/server';

export interface Me {
  userId: string;
  tenantId: string;
  username: string;
  fullName: string;
  branchIds: string[];
  roles: string[];
  permissions: PermissionCode[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Llama al backend NestJS desde el servidor con el token de la sesión.
 * El backend verifica la firma del token; aquí solo se reenvía.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = await createClient();
  // auth-js lee Date.now() para validar la expiración; io() lo deja fuera del prerender.
  await io();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, 'Sin sesión');

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

/**
 * Usuario en sesión. `use cache: private` lee las cookies y la hora de expiración
 * del token dentro de un ámbito privado (solo en el navegador del usuario), como
 * recomienda Next.js 16 para sesiones con Cache Components.
 * Solo alimenta la UI: el backend vuelve a verificar permisos en cada petición.
 */
export const getMe = cache(async (): Promise<Me> => {
  'use cache: private';
  cacheLife('minutes');
  return apiFetch<Me>('/auth/me');
});
