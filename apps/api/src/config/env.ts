import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3101),
  /** Conexión del pooler de Supabase en modo transacción (puerto 6543). */
  DATABASE_URL: z.url(),
  /** Conexiones por instancia (en serverless conviene 1–2). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  /** URL del proyecto, p. ej. https://xxxx.supabase.co */
  SUPABASE_URL: z.url(),
  /** Origen permitido para CORS (frontend). */
  WEB_ORIGIN: z.string().default('http://localhost:3100'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
