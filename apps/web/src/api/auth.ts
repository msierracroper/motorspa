import { usernameToEmail } from '@motospa/shared';
import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/*
 * Sesión de Supabase como store externo: `undefined` mientras se lee la sesión
 * guardada, `null` sin sesión, o la sesión activa.
 */
let current: Session | null | undefined;
const listeners = new Set<() => void>();
const emit = (session: Session | null) => {
  current = session;
  listeners.forEach((l) => l());
};

void supabase.auth.getSession().then(({ data }) => emit(data.session));
supabase.auth.onAuthStateChange((_event, session) => emit(session));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, () => current);
}

/** Inicia sesión con usuario + contraseña (correo sintético, SPEC decisión 13). */
export async function signIn(username: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
}

/**
 * Cierra la sesión al instante en la pantalla; la revocación del token en
 * Supabase sigue en segundo plano (si falla, el token vence solo).
 */
export function signOut(): void {
  emit(null);
  void supabase.auth.signOut().catch(() => undefined);
}

/** Token vigente para llamar al backend (supabase-js lo refresca solo). */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
