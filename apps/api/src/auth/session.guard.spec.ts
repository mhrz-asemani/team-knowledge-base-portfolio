import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { SessionGuard } from './session.guard';

describe('SessionGuard', () => {
  const database = { query: vi.fn() };
  let guard: SessionGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new SessionGuard(database as unknown as DatabaseService);
  });

  function context(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('attaches the authenticated user for a valid session', async () => {
    const request: Record<string, any> = {
      cookies: { [SESSION_COOKIE_NAME]: 'a'.repeat(43) },
    };
    database.query.mockResolvedValueOnce({
      rows: [
        {
          session_id: 'session-1',
          user_id: 'user-1',
          email: 'person@example.com',
          expires_at: new Date(Date.now() + 60_000),
          revoked_at: null,
        },
      ],
    });

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.authenticatedUser).toEqual({
      id: 'user-1',
      email: 'person@example.com',
      sessionId: 'session-1',
    });
  });

  it('rejects expired sessions', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        {
          session_id: 'session-1',
          user_id: 'user-1',
          email: 'person@example.com',
          expires_at: new Date(Date.now() - 60_000),
          revoked_at: null,
        },
      ],
    });

    await expect(
      guard.canActivate(
        context({ cookies: { [SESSION_COOKIE_NAME]: 'a'.repeat(43) } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects requests without a session cookie', async () => {
    await expect(guard.canActivate(context({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });
});
