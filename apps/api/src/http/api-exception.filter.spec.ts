import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  function host(path = '/api/v1/example') {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const request = { originalUrl: path, url: path };
    const argumentHost = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { argumentHost, response };
  }

  it('returns a stable validation error envelope', () => {
    const { argumentHost, response } = host('/api/v1/auth/register');
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'password must be longer'],
        error: 'Bad Request',
      }),
      argumentHost,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { message: 'email must be an email' },
          { message: 'password must be longer' },
        ],
        path: '/api/v1/auth/register',
      }),
    );
  });

  it('maps known HTTP errors without changing their status', () => {
    const { argumentHost, response } = host();
    filter.catch(new NotFoundException('Workspace not found'), argumentHost);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      }),
    );
  });

  it('does not expose unexpected internal errors', () => {
    const { argumentHost, response } = host();
    filter.catch(new Error('database password should never be returned'), argumentHost);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'database password',
    );
  });
});
