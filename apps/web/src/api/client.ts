import { getAccessToken } from './auth';

export class ApiError extends Error {
  /** Código HTTP; 0 cuando no hubo conexión con el servidor. */
  readonly status: number;
  /** Código de negocio opcional (p. ej. DISCOUNT_AUTH_REQUIRED). */
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3101';

/** Llama al backend NestJS con el token de la sesión. El backend verifica todo. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, 'Sin sesión');

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | { message?: string; code?: string };
      code?: string;
    } | null;
    // Nest anida el objeto de la excepción en `message` cuando se lanza con un objeto.
    const nested = typeof body?.message === 'object' ? body.message : null;
    const message =
      nested?.message ?? (typeof body?.message === 'string' ? body.message : res.statusText);
    throw new ApiError(res.status, message, nested?.code ?? body?.code);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function apiSend<T>(
  path: string,
  body?: unknown,
  method: 'POST' | 'PATCH' | 'PUT' = 'POST',
) {
  return apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
