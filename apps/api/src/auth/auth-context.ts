import type { PermissionCode } from '@motospa/shared';

/** Usuario autenticado y sus permisos, adjunto a cada petición. */
export interface AuthContext {
  authUserId: string;
  tenantId: string;
  userId: string;
  username: string;
  fullName: string;
  branchIds: string[];
  roles: string[];
  permissions: PermissionCode[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  auth?: AuthContext;
}

/** true si el usuario tiene TODOS los permisos requeridos. */
export function hasPermissions(
  granted: readonly PermissionCode[],
  required: readonly PermissionCode[],
): boolean {
  return required.every((p) => granted.includes(p));
}
