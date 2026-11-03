import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let ping: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ping = vi.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: { ping },
        },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('returns an OK status and service identifier', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'team-knowledge-base-api',
    });
  });

  it('reports readiness when the database responds', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      database: 'ok',
    });
    expect(ping).toHaveBeenCalledOnce();
  });

  it('returns service unavailable without leaking database errors', async () => {
    ping.mockRejectedValueOnce(new Error('sensitive connection details'));
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
