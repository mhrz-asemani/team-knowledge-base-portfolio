import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OriginGuard } from './origin.guard';

describe('OriginGuard', () => {
  const config = {
    get: vi.fn().mockReturnValue('http://localhost:5173'),
  };
  let guard: OriginGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new OriginGuard(config as unknown as ConfigService);
  });

  function context(method: string, headers: Record<string, string> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          get: (name: string) => headers[name.toLowerCase()],
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows safe methods without origin headers', () => {
    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('allows state-changing requests from the configured origin', () => {
    expect(
      guard.canActivate(context('POST', { origin: 'http://localhost:5173' })),
    ).toBe(true);
  });

  it('accepts a configured Render hostname without a scheme', () => {
    config.get.mockReturnValue('team-knowledge-base-web.onrender.com');
    expect(
      guard.canActivate(context('POST', { origin: 'https://team-knowledge-base-web.onrender.com' })),
    ).toBe(true);
  });

  it('rejects missing or untrusted origins on state-changing requests', () => {
    expect(() => guard.canActivate(context('POST'))).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(context('POST', { origin: 'https://attacker.example' })),
    ).toThrow(ForbiddenException);
  });
});
