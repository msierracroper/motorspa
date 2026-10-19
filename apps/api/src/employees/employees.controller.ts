import { Controller, Get, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators.js';
import { DbService } from '../db/db.service.js';
import { employees } from '../db/schema.js';

@Injectable()
export class EmployeesService {
  constructor(private readonly db: DbService) {}

  /** Lavadores activos (para asignar servicios). */
  listActive(auth: AuthContext) {
    return this.db.withTenant({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
      tx
        .select({ id: employees.id, fullName: employees.fullName, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.active, true), isNull(employees.deletedAt)))
        .orderBy(asc(employees.fullName)),
    );
  }
}

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.employees.listActive(auth);
  }
}
