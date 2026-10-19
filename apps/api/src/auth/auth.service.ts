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

  /** Carga el usuario interno, sus sedes, roles y permisos (bajo RLS del tenant). */
  async loadContext(token: VerifiedToken): Promise<AuthContext> {
    return this.db.withTenant({ tenantId: token.tenantId }, async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.authUserId, token.authUserId),
            eq(users.status, 'ACTIVE'),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (!user) throw new UnauthorizedException('Usuario inactivo o inexistente');

      const rows = await tx
        .select({
          branchId: userBranchRoles.branchId,
          roleName: roles.name,
          permission: rolePermissions.permissionCode,
        })
        .from(userBranchRoles)
        .innerJoin(roles, and(eq(roles.id, userBranchRoles.roleId), isNull(roles.deletedAt)))
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(eq(userBranchRoles.userId, user.id));

      const unique = <T>(values: (T | null)[]) => [
        ...new Set(values.filter((v): v is T => v !== null)),
      ];

      return {
        authUserId: token.authUserId,
        tenantId: token.tenantId,
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        branchIds: unique(rows.map((r) => r.branchId)),
        roles: unique(rows.map((r) => r.roleName)),
        permissions: unique(rows.map((r) => r.permission as PermissionCode | null)),
      };
    });
  }
}
