import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const database = { query: vi.fn() };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(database as unknown as DatabaseService);
  });

  it('normalizes email and stores only an Argon2id password hash', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ id: 'user-1', email: 'person@example.com' }],
    });

    const result = await service.register({
      email: 'Person@Example.com',
      password: 'a sufficiently long password',
    });

    expect(result).toEqual({ id: 'user-1', email: 'person@example.com' });
    const [sql, values] = database.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO users');
    expect(values[0]).toBe('person@example.com');
    expect(values[1]).not.toBe('a sufficiently long password');
    await expect(argon2.verify(values[1], 'a sufficiently long password')).resolves.toBe(true);
  });

  it('returns a conflict for a duplicate email', async () => {
    database.query.mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.register({
        email: 'person@example.com',
        password: 'a sufficiently long password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a session and stores only a hash of the session token', async () => {
    const passwordHash = await argon2.hash('a sufficiently long password', {
      type: argon2.argon2id,
    });
    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'person@example.com',
            password_hash: passwordHash,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const session = await service.login({
      email: 'PERSON@example.com',
      password: 'a sufficiently long password',
    });

    expect(session.user).toEqual({ id: 'user-1', email: 'person@example.com' });
    expect(session.sessionToken).toHaveLength(43);
    const [, values] = database.query.mock.calls[1];
    expect(values[0]).toBe('user-1');
    expect(values[1]).toBe(
      createHash('sha256').update(session.sessionToken).digest('hex'),
    );
    expect(values).not.toContain(session.sessionToken);
  });

  it('uses a generic authentication error for invalid credentials', async () => {
    const passwordHash = await argon2.hash('the correct password', {
      type: argon2.argon2id,
    });
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          email: 'person@example.com',
          password_hash: passwordHash,
        },
      ],
    });

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'the wrong password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).toHaveBeenCalledOnce();
  });

  it('revokes a session by its hash and treats logout without a cookie as idempotent', async () => {
    const token = 'a'.repeat(43);
    database.query.mockResolvedValueOnce({ rows: [] });

    await service.logout(token);

    expect(database.query.mock.calls[0][1]).toEqual([
      createHash('sha256').update(token).digest('hex'),
    ]);
    await service.logout(undefined);
    expect(database.query).toHaveBeenCalledOnce();
  });
});
