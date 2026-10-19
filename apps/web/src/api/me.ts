import type { PermissionCode } from '@motospa/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface Me {
  userId: string;
  tenantId: string;
  username: string;
  fullName: string;
  branchIds: string[];
  roles: string[];
  permissions: PermissionCode[];
}

/** Usuario en sesión, sus roles y permisos (solo para armar la UI). */
export function useMe(authUserId: string | undefined) {
  return useQuery({
    queryKey: ['me', authUserId],
    queryFn: () => apiFetch<Me>('/auth/me'),
    enabled: Boolean(authUserId),
    staleTime: 5 * 60_000,
  });
}
