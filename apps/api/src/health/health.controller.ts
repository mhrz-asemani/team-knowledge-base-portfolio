import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'team-knowledge-base-api',
    };
  }

  @Get('ready')
  async getReadiness() {
    try {
      await this.database.ping();
      return {
        status: 'ready',
        database: 'ok',
      };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }
}
