import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS as P, reportDateSchema } from '@motospa/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequireAnyPermission } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@RequireAnyPermission(P.REPORTS_OPERATIONS, P.REPORTS_OPERATIONS_OWN_SHIFT, P.REPORTS_FINANCE)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  daily(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodPipe(reportDateSchema)) q: { date: string },
  ) {
    return this.reports.daily(auth, q.date);
  }
}
