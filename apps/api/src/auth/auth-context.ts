import type { PermissionCode } from '@motospa/shared';

/** Usuario autenticado y sus permisos, adjunto a cada petición. */
export interface AuthContext {
  authUserId: string;
  tenantId: string;
  userId: string;
  /** Empleado vinculado (lavador), si existe. */
  employeeId: string | null;
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

/** Sede de trabajo: en la Fase 1 hay una sola sede por usuario (SPEC decisión 6). */
export function branchOf(auth: AuthContext): string {
  const branch = auth.branchIds[0];
  if (!branch) throw new Error('El usuario no tiene sede asignada');
  return branch;
}

/** true si el usuario tiene TODOS los permisos requeridos. */
export function hasPermissions(
  granted: readonly PermissionCode[],
  required: readonly PermissionCode[],
): boolean {
  return required.every((p) => granted.includes(p));
}
