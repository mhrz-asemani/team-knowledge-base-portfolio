import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import { DatabaseService } from './database.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const connectionString = config.get<string>('DATABASE_URL');
        if (!connectionString) {
          throw new Error('DATABASE_URL must be configured before starting the API.');
        }

        const max = Number(config.get<string>('DB_POOL_MAX') ?? 10);
        if (!Number.isInteger(max) || max < 1 || max > 50) {
          throw new Error('DB_POOL_MAX must be an integer between 1 and 50.');
        }

        const pool = new Pool({
          connectionString,
          max,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        });

        pool.on('error', (error: Error) => {
          Logger.error(
            'Unexpected error on an idle PostgreSQL client',
            error.stack,
            'DatabasePool',
          );
        });

        return pool;
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
