import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface TenantScope {
  tenantId: string;
  userId?: string;
}

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly client: postgres.Sql;
  private readonly db: Db;

  constructor(config: ConfigService<Env, true>) {
    // prepare: false es obligatorio con el pooler en modo transacción.
    this.client = postgres(config.get('DATABASE_URL'), { prepare: false, max: 5 });
    this.db = drizzle(this.client, { schema });
  }

  /**
   * Ejecuta `fn` en una transacción aislada por tenant: asume el rol `app_api`
   * (sujeto a RLS) y define app.tenant_id / app.user_id para las políticas.
   */
  async withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_api`);
      await tx.execute(
        sql`select set_config('app.tenant_id', ${scope.tenantId}, true),
                   set_config('app.user_id', ${scope.userId ?? ''}, true)`,
      );
      return fn(tx);
    });
  }

  async ping(): Promise<void> {
    await this.client`select 1`;
  }

  async onModuleDestroy() {
    await this.client.end({ timeout: 5 });
  }
}
