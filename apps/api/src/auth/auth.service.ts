import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { SESSION_TTL_MS } from './auth.constants';

interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  password_hash: string;
}

export interface PublicUser {
  id: string;
  email: string;
}

export interface CreatedSession {
  sessionToken: string;
  expiresAt: Date;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(input: RegisterDto): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    try {
      const result = await this.database.query<UserRow>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [email, passwordHash],
      );

      return {
        id: result.rows[0].id,
        email: result.rows[0].email,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(input: LoginDto): Promise<CreatedSession> {
    const email = input.email.trim().toLowerCase();
    const result = await this.database.query<UserRow>(
      'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    const user = result.rows[0];

    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.database.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt],
    );

    return {
      sessionToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async logout(sessionToken?: string): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.database.query(
      'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashSessionToken(sessionToken)],
    );
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
