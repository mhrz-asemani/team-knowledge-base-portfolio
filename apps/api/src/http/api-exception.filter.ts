import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ApiErrorDetail {
  message: string;
}

interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  path: string;
  timestamp: string;
}

const ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: ApiErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      const payloadMessage =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? payload.message
          : payload;

      if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(payloadMessage)) {
        code = 'VALIDATION_ERROR';
        message = 'Request validation failed';
        details = payloadMessage.map((item) => ({ message: String(item) }));
      } else {
        code = ERROR_CODES[statusCode] ?? 'HTTP_ERROR';
        if (typeof payloadMessage === 'string') {
          message = payloadMessage;
        } else if (Array.isArray(payloadMessage)) {
          message = payloadMessage.map(String).join(', ');
        }
      }
    } else {
      this.logger.error(
        'Unhandled request error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorBody = {
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
