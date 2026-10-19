import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { DbService } from '../db/db.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.db.ping();
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
