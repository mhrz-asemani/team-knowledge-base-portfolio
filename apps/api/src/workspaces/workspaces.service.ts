import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';

export type WorkspaceRole = 'owner' | 'member' | 'viewer';

interface WorkspaceRow extends QueryResultRow {
  id: string;
  name: string;
  role: WorkspaceRole;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string): Promise<WorkspaceResponse[]> {
    const result = await this.database.query<WorkspaceRow>(
      `SELECT w.id, w.name, wm.role, w.created_at, w.updated_at
       FROM workspace_members wm
       INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.updated_at DESC, w.id ASC`,
      [userId],
    );

    return result.rows.map(mapWorkspace);
  }

  async create(userId: string, input: CreateWorkspaceDto): Promise<WorkspaceResponse> {
    const name = input.name.trim();

    return this.database.transaction(async (client) => {
      const result = await client.query<WorkspaceRow>(
        `INSERT INTO workspaces (name, created_by)
         VALUES ($1, $2)
         RETURNING id, name, created_at, updated_at`,
        [name, userId],
      );
      const workspace = result.rows[0];

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [workspace.id, userId],
      );

      return mapWorkspace({ ...workspace, role: 'owner' });
    });
  }

  async getForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceResponse> {
    const result = await this.database.query<WorkspaceRow>(
      `SELECT w.id, w.name, wm.role, w.created_at, w.updated_at
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1 AND wm.user_id = $2
       LIMIT 1`,
      [workspaceId, userId],
    );
    const workspace = result.rows[0];

    if (!workspace) {
      // Deliberately hide whether a non-member's workspace exists.
      throw new NotFoundException('Workspace not found');
    }

    return mapWorkspace(workspace);
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapWorkspace(row: WorkspaceRow): WorkspaceResponse {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
