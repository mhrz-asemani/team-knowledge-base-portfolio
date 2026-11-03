import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { hashSessionToken } from './auth.service';
import { SESSION_COOKIE_NAME } from './auth.constants';

export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
}

interface SessionRow extends QueryResultRow {
  session_id: string;
  user_id: string;
  email: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.database.query<SessionRow>(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, u.email
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [hashSessionToken(token)],
    );
    const session = result.rows[0];

    if (
      !session ||
      session.revoked_at !== null ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    request.authenticatedUser = {
      id: session.user_id,
      email: session.email,
      sessionId: session.session_id,
    };
    return true;
  }
}
