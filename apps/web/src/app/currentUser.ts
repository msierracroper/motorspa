import { createContext, useContext } from 'react';
import type { Me } from '@/api/me';

export const CurrentUserContext = createContext<Me | null>(null);

/** Usuario en sesión. Solo se usa dentro del armazón autenticado. */
export function useCurrentUser(): Me {
  const me = useContext(CurrentUserContext);
  if (!me) throw new Error('useCurrentUser se usó fuera de una sesión iniciada');
  return me;
}
