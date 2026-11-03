import { NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  const database = {
    query: vi.fn(),
    transaction: vi.fn(),
  };
  let service: WorkspacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkspacesService(database as unknown as DatabaseService);
  });

  it('lists only workspaces joined through the current user membership', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'workspace-1',
          name: 'Engineering',
          role: 'member',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.listForUser('user-1')).resolves.toEqual([
      {
        id: 'workspace-1',
        name: 'Engineering',
        role: 'member',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(database.query.mock.calls[0][0]).toContain('WHERE wm.user_id = $1');
    expect(database.query.mock.calls[0][1]).toEqual(['user-1']);
  });

  it('creates the workspace and owner membership in one transaction', async () => {
    const client = { query: vi.fn() };
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'workspace-1',
            name: 'Engineering',
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    database.transaction.mockImplementation(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work(client as unknown as PoolClient),
    );

    await expect(
      service.create('user-1', { name: ' Engineering ' }),
    ).resolves.toEqual({
      id: 'workspace-1',
      name: 'Engineering',
      role: 'owner',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][1]).toEqual(['Engineering', 'user-1']);
    expect(client.query.mock.calls[1][1]).toEqual([
      'workspace-1',
      'user-1',
    ]);
  });

  it('does not reveal workspaces to non-members', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getForUser('workspace-secret', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query.mock.calls[0][1]).toEqual([
      'workspace-secret',
      'user-1',
    ]);
  });
});
