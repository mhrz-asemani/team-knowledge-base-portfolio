import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const candidate = request.get('origin') ?? request.get('referer');
    if (!candidate) {
      throw new ForbiddenException('Origin or Referer header is required');
    }

    let requestOrigin: string;
    try {
      requestOrigin = new URL(candidate).origin;
    } catch {
      throw new ForbiddenException('Invalid request origin');
    }

    const configuredOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
    const absoluteConfiguredOrigin = configuredOrigin.includes('://')
      ? configuredOrigin
      : `https://${configuredOrigin}`;
    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(absoluteConfiguredOrigin).origin;
    } catch {
      throw new Error('WEB_ORIGIN must be a valid absolute origin');
    }

    if (requestOrigin !== allowedOrigin) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    return true;
  }
}
