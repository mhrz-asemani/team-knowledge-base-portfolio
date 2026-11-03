import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import type { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';

export type WorkspaceMemberRole = 'owner' | 'member' | 'viewer';

interface MembershipRow extends QueryResultRow {
  user_id: string;
  email: string;
  role: WorkspaceMemberRole;
  created_at: Date | string;
}

interface UserEmailRow extends QueryResultRow {
  user_id: string;
  email: string;
}

export interface WorkspaceMemberResponse {
  userId: string;
  email: string;
  role: WorkspaceMemberRole;
  createdAt: string;
}

@Injectable()
export class MembershipsService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    workspaceId: string,
    requesterId: string,
  ): Promise<WorkspaceMemberResponse[]> {
    const result = await this.database.query<MembershipRow>(
      `SELECT wm.user_id, u.email, wm.role, wm.created_at
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
         AND EXISTS (
           SELECT 1 FROM workspace_members access
           WHERE access.workspace_id = wm.workspace_id
             AND access.user_id = $2
         )
       ORDER BY
         CASE wm.role WHEN 'owner' THEN 0 WHEN 'member' THEN 1 ELSE 2 END,
         u.email ASC`,
      [workspaceId, requesterId],
    );

    if (result.rows.length === 0) {
      // An empty member list is not valid: every workspace starts with an owner.
      // Treat no visible rows as a missing/inaccessible workspace.
      throw new NotFoundException('Workspace not found');
    }

    return result.rows.map(mapMember);
  }

  async add(
    workspaceId: string,
    requesterId: string,
    input: AddWorkspaceMemberDto,
  ): Promise<WorkspaceMemberResponse> {
    try {
      return await this.database.transaction(async (client) => {
        await this.requireOwner(client, workspaceId, requesterId);

        const userResult = await client.query<UserEmailRow>(
          'SELECT id AS user_id, email FROM users WHERE email = $1 LIMIT 1',
          [input.email.trim().toLowerCase()],
        );
        const user = userResult.rows[0];

        if (!user) {
          throw new NotFoundException('Registered user not found');
        }

        const result = await client.query<MembershipRow>(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, 'member')
           RETURNING user_id, $3::text AS email, role, created_at`,
          [workspaceId, user.user_id, user.email],
        );

        return mapMember(result.rows[0]);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('User is already a workspace member');
      }
      throw error;
    }
  }

  async updateRole(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
    input: UpdateWorkspaceMemberRoleDto,
  ): Promise<WorkspaceMemberResponse> {
    return this.database.transaction(async (client) => {
      await this.requireOwner(client, workspaceId, requesterId);
      const target = await this.getTargetMembership(
        client,
        workspaceId,
        targetUserId,
      );

      if (target.role === 'owner') {
        throw new ForbiddenException(
          'Workspace ownership cannot be changed through role management',
        );
      }

      const result = await client.query<MembershipRow>(
        `UPDATE workspace_members
         SET role = $3
         WHERE workspace_id = $1 AND user_id = $2
         RETURNING user_id, role, created_at,
           (SELECT u.email FROM users u WHERE u.id = workspace_members.user_id) AS email`,
        [workspaceId, targetUserId, input.role],
      );

      return mapMember(result.rows[0]);
    });
  }

  async remove(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.requireOwner(client, workspaceId, requesterId);
      const target = await this.getTargetMembership(
        client,
        workspaceId,
        targetUserId,
      );

      if (target.role === 'owner') {
        throw new ForbiddenException(
          'Workspace ownership cannot be changed through membership management',
        );
      }

      await client.query(
        'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, targetUserId],
      );
    });
  }

  private async requireOwner(
    client: PoolClient,
    workspaceId: string,
    requesterId: string,
  ): Promise<void> {
    const result = await client.query<{ role: WorkspaceMemberRole }>(
      `SELECT role FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2
       FOR UPDATE`,
      [workspaceId, requesterId],
    );
    const membership = result.rows[0];

    if (!membership) {
      throw new NotFoundException('Workspace not found');
    }

    if (membership.role !== 'owner') {
      throw new ForbiddenException('Only workspace owners can manage members');
    }
  }

  private async getTargetMembership(
    client: PoolClient,
    workspaceId: string,
    targetUserId: string,
  ): Promise<MembershipRow> {
    const result = await client.query<MembershipRow>(
      `SELECT wm.user_id, u.email, wm.role, wm.created_at
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2
       FOR UPDATE OF wm`,
      [workspaceId, targetUserId],
    );
    const target = result.rows[0];

    if (!target) {
      throw new NotFoundException('Workspace member not found');
    }

    return target;
  }
}

function mapMember(row: MembershipRow): WorkspaceMemberResponse {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
