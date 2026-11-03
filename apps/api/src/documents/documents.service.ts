import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import type { UpdateDocumentDto } from './dto/update-document.dto';

type WorkspaceRole = 'owner' | 'member' | 'viewer';
type DocumentSort = 'title' | 'createdAt' | 'updatedAt';

interface DocumentRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  created_by: string;
  updated_by: string;
  title: string;
  content_markdown: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RoleRow extends QueryResultRow {
  role: WorkspaceRole;
}

export interface DocumentResponse {
  id: string;
  workspaceId: string;
  createdBy: string;
  updatedBy: string;
  title: string;
  contentMarkdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents: DocumentResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

const SORT_COLUMNS: Record<DocumentSort, string> = {
  title: 'd.title',
  createdAt: 'd.created_at',
  updatedAt: 'd.updated_at',
};

const MAX_PAGE_SIZE = 100;

@Injectable()
export class DocumentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    workspaceId: string,
    userId: string,
    query: ListDocumentsQueryDto,
  ): Promise<DocumentListResponse> {
    await this.requireMembership(workspaceId, userId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (pageSize > MAX_PAGE_SIZE) {
      throw new BadRequestException('pageSize must not exceed 100');
    }

    const search = query.q?.trim() ?? '';
    const searchPattern = `%${search}%`;
    const sortColumn = SORT_COLUMNS[query.sort ?? 'updatedAt'];
    const order = (query.order ?? 'desc').toUpperCase();
    const offset = (page - 1) * pageSize;

    const countResult = await this.database.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM documents d
       WHERE d.workspace_id = $1
         AND ($2 = '' OR d.title ILIKE $3 OR d.content_markdown ILIKE $3)`,
      [workspaceId, search, searchPattern],
    );
    const totalItems = Number(countResult.rows[0]?.total ?? 0);

    const result = await this.database.query<DocumentRow>(
      `SELECT d.id, d.workspace_id, d.created_by, d.updated_by,
              d.title, d.content_markdown, d.created_at, d.updated_at
       FROM documents d
       WHERE d.workspace_id = $1
         AND ($2 = '' OR d.title ILIKE $3 OR d.content_markdown ILIKE $3)
       ORDER BY ${sortColumn} ${order}, d.id ASC
       LIMIT $4 OFFSET $5`,
      [workspaceId, search, searchPattern, pageSize, offset],
    );

    return {
      documents: result.rows.map(mapDocument),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async get(workspaceId: string, documentId: string, userId: string): Promise<DocumentResponse> {
    await this.requireMembership(workspaceId, userId);
    const result = await this.database.query<DocumentRow>(
      `SELECT id, workspace_id, created_by, updated_by,
              title, content_markdown, created_at, updated_at
       FROM documents
       WHERE id = $1 AND workspace_id = $2
       LIMIT 1`,
      [documentId, workspaceId],
    );
    const document = result.rows[0];

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return mapDocument(document);
  }

  async create(workspaceId: string, userId: string, input: CreateDocumentDto): Promise<DocumentResponse> {
    return this.database.transaction(async (client) => {
      await this.requireRole(client, workspaceId, userId, true);
      const result = await client.query<DocumentRow>(
        `INSERT INTO documents
           (workspace_id, created_by, updated_by, title, content_markdown)
         VALUES ($1, $2, $2, $3, $4)
         RETURNING id, workspace_id, created_by, updated_by,
                   title, content_markdown, created_at, updated_at`,
        [workspaceId, userId, input.title, input.contentMarkdown ?? ''],
      );
      return mapDocument(result.rows[0]);
    });
  }

  async update(workspaceId: string, documentId: string, userId: string, input: UpdateDocumentDto): Promise<DocumentResponse> {
    if (input.title === undefined && input.contentMarkdown === undefined) {
      throw new BadRequestException('At least one of title or contentMarkdown must be provided');
    }

    return this.database.transaction(async (client) => {
      await this.requireRole(client, workspaceId, userId, true);
      const result = await client.query<DocumentRow>(
        `UPDATE documents
         SET title = COALESCE($3, title),
             content_markdown = COALESCE($4, content_markdown),
             updated_by = $5,
             updated_at = now()
         WHERE id = $1 AND workspace_id = $2
         RETURNING id, workspace_id, created_by, updated_by,
                   title, content_markdown, created_at, updated_at`,
        [documentId, workspaceId, input.title, input.contentMarkdown, userId],
      );
      const document = result.rows[0];

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      return mapDocument(document);
    });
  }

  async remove(workspaceId: string, documentId: string, userId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.requireRole(client, workspaceId, userId, true);
      const result = await client.query(
        'DELETE FROM documents WHERE id = $1 AND workspace_id = $2 RETURNING id',
        [documentId, workspaceId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundException('Document not found');
      }
    });
  }

  private async requireMembership(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    const result = await this.database.query<RoleRow>(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1',
      [workspaceId, userId],
    );
    const membership = result.rows[0];

    if (!membership) {
      throw new NotFoundException('Workspace not found');
    }

    return membership.role;
  }

  private async requireRole(client: PoolClient, workspaceId: string, userId: string, write: boolean): Promise<WorkspaceRole> {
    const result = await client.query<RoleRow>(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE',
      [workspaceId, userId],
    );
    const membership = result.rows[0];

    if (!membership) {
      throw new NotFoundException('Workspace not found');
    }

    if (write && membership.role === 'viewer') {
      throw new ForbiddenException('Viewer role cannot modify documents');
    }

    return membership.role;
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapDocument(row: DocumentRow): DocumentResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    title: row.title,
    contentMarkdown: row.content_markdown,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
