import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PermissionCode } from '@motospa/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service.js';
import { rolePermissions, roles, userBranchRoles, users } from '../db/schema.js';
import type { AuthContext } from './auth-context.js';
import type { VerifiedToken } from './token-verifier.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  /**
   * Carga el usuario interno, sus sedes, roles y permisos (bajo RLS del tenant)
   * en una sola consulta: una fila por permiso de cada rol asignado.
   */
  async loadContext(token: VerifiedToken): Promise<AuthContext> {
    return this.db.withTenant({ tenantId: token.tenantId }, async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          username: users.username,
          fullName: users.fullName,
          branchId: userBranchRoles.branchId,
          roleName: roles.name,
          permission: rolePermissions.permissionCode,
        })
        .from(users)
        .leftJoin(userBranchRoles, eq(userBranchRoles.userId, users.id))
        .leftJoin(roles, and(eq(roles.id, userBranchRoles.roleId), isNull(roles.deletedAt)))
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(
          and(
            eq(users.authUserId, token.authUserId),
            eq(users.status, 'ACTIVE'),
            isNull(users.deletedAt),
          ),
        );

      const [user] = rows;
      if (!user) throw new UnauthorizedException('Usuario inactivo o inexistente');

      const unique = <T>(values: (T | null)[]) => [
        ...new Set(values.filter((v): v is T => v !== null)),
      ];
      // Un rol borrado deja la sede sin rol: no cuenta como acceso a esa sede.
      const withRole = rows.filter((r) => r.roleName !== null);

      return {
        authUserId: token.authUserId,
        tenantId: token.tenantId,
        userId: user.userId,
        username: user.username,
        fullName: user.fullName,
        branchIds: unique(withRole.map((r) => r.branchId)),
        roles: unique(withRole.map((r) => r.roleName)),
        permissions: unique(withRole.map((r) => r.permission as PermissionCode | null)),
      };
    });
  }
}
