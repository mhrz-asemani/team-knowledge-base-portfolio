import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MembershipsService } from './memberships.service';

describe('MembershipsService', () => {
  const database = {
    query: vi.fn(),
    transaction: vi.fn(),
  };
  const client = { query: vi.fn() };
  let service: MembershipsService;

  beforeEach(() => {
    vi.clearAllMocks();
    database.transaction.mockImplementation(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work(client as unknown as PoolClient),
    );
    service = new MembershipsService(database as unknown as DatabaseService);
  });

  it('lists members only when the requester belongs to the workspace', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'owner-id',
          email: 'owner@example.com',
          role: 'owner',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          user_id: 'member-id',
          email: 'member@example.com',
          role: 'member',
          created_at: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.list('workspace-id', 'owner-id')).resolves.toEqual([
      {
        userId: 'owner-id',
        email: 'owner@example.com',
        role: 'owner',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        userId: 'member-id',
        email: 'member@example.com',
        role: 'member',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(database.query.mock.calls[0][1]).toEqual([
      'workspace-id',
      'owner-id',
    ]);
    expect(database.query.mock.calls[0][0]).toContain('access.user_id = $2');
  });

  it('hides workspaces from users who are not members', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.list('private-workspace', 'outsider-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds an existing user as a member in a transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'new-user-id', email: 'new@example.com' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'new-user-id',
            email: 'new@example.com',
            role: 'member',
            created_at: new Date('2026-01-03T00:00:00.000Z'),
          },
        ],
      });

    await expect(
      service.add('workspace-id', 'owner-id', {
        email: ' New@Example.com ',
      }),
    ).resolves.toEqual({
      userId: 'new-user-id',
      email: 'new@example.com',
      role: 'member',
      createdAt: '2026-01-03T00:00:00.000Z',
    });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(client.query.mock.calls[1][1]).toEqual(['new@example.com']);
    expect(client.query.mock.calls[2][1]).toEqual([
      'workspace-id',
      'new-user-id',
      'new@example.com',
    ]);
  });

  it('does not allow a regular member to manage memberships', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

    await expect(
      service.add('workspace-id', 'member-id', {
        email: 'new@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('rejects adding an email that is not registered', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.add('workspace-id', 'owner-id', {
        email: 'missing@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('converts duplicate membership constraints to a conflict response', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'member-id', email: 'member@example.com' }],
      })
      .mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.add('workspace-id', 'owner-id', {
        email: 'member@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an owner to change a member to viewer', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'member-id',
            email: 'member@example.com',
            role: 'member',
            created_at: new Date('2026-01-02T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'member-id',
            email: 'member@example.com',
            role: 'viewer',
            created_at: new Date('2026-01-02T00:00:00.000Z'),
          },
        ],
      });

    await expect(
      service.updateRole('workspace-id', 'owner-id', 'member-id', {
        role: 'viewer',
      }),
    ).resolves.toMatchObject({ userId: 'member-id', role: 'viewer' });
    expect(client.query.mock.calls[2][1]).toEqual([
      'workspace-id',
      'member-id',
      'viewer',
    ]);
  });

  it('prevents role management from changing the owner role', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'owner-id',
            email: 'owner@example.com',
            role: 'owner',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });

    await expect(
      service.updateRole('workspace-id', 'owner-id', 'owner-id', {
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('prevents removing the workspace owner', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'owner-id',
            email: 'owner@example.com',
            role: 'owner',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });

    await expect(
      service.remove('workspace-id', 'owner-id', 'owner-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
