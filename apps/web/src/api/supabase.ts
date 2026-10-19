import { createClient } from '@supabase/supabase-js';

/**
 * Cliente único de Supabase. Regla: solo los módulos de src/api/ lo importan;
 * las pantallas usan los hooks de api/. Solo se usa para la sesión (Auth):
 * los datos de negocio siempre van por el backend NestJS (SPEC decisión 11).
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Copia apps/web/.env.example como .env.local.',
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
