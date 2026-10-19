import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth-context.js';
import type { Tx } from '../db/db.service.js';
import { auditLogs } from '../db/schema.js';

export interface AuditEntry {
  entity: string;
  entityId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  branchId?: string;
  ip?: string;
}

/**
 * Bitácora de auditoría (SPEC sección 0, regla 5).
 * Se escribe con la MISMA transacción del cambio: si el cambio se revierte,
 * el registro también; si el registro falla, el cambio no se aplica.
 */
@Injectable()
export class AuditService {
  async log(tx: Tx, auth: AuthContext, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      branchId: entry.branchId ?? null,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
    });
  }
}
