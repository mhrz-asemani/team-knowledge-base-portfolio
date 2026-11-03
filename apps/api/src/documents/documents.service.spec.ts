import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from './documents.service';
import type { ListDocumentsQueryDto } from './dto/list-documents-query.dto';

describe('DocumentsService', () => {
  const database = {
    query: vi.fn(),
    transaction: vi.fn(),
  };
  const client = { query: vi.fn() };
  let service: DocumentsService;

  const documentRow = {
    id: 'document-1',
    workspace_id: 'workspace-1',
    created_by: 'user-1',
    updated_by: 'user-1',
    title: 'Architecture',
    content_markdown: '# System',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    database.transaction.mockImplementation(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work(client as unknown as PoolClient),
    );
    service = new DocumentsService(database as unknown as DatabaseService);
  });

  it('lists only after membership verification and returns pagination metadata', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [{ total: '21' }] })
      .mockResolvedValueOnce({ rows: [documentRow] });

    await expect(
      service.list('workspace-1', 'user-1', {
        q: 'arch',
        sort: 'title',
        order: 'asc',
        page: 2,
        pageSize: 10,
      } as ListDocumentsQueryDto),
    ).resolves.toEqual({
      documents: [{
        id: 'document-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        title: 'Architecture',
        contentMarkdown: '# System',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }],
      pagination: { page: 2, pageSize: 10, totalItems: 21, totalPages: 3 },
    });

    expect(database.query.mock.calls[1][0]).toContain('d.title ILIKE $3');
    expect(database.query.mock.calls[2][0]).toContain('ORDER BY d.title ASC');
    expect(database.query.mock.calls[2][1]).toEqual(['workspace-1', 'arch', '%arch%', 10, 10]);
  });

  it('does not reveal a workspace to a non-member', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.list('workspace-secret', 'user-1', {} as ListDocumentsQueryDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query).toHaveBeenCalledOnce();
  });

  it('rejects a page size above the maximum', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

    await expect(
      service.list('workspace-1', 'user-1', { page: 1, pageSize: 101 } as ListDocumentsQueryDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a document only after checking a writable membership', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [documentRow] });

    await expect(
      service.create('workspace-1', 'user-1', { title: 'Architecture', contentMarkdown: '# System' }),
    ).resolves.toMatchObject({ id: 'document-1', workspaceId: 'workspace-1' });

    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO documents');
    expect(client.query.mock.calls[1][1]).toEqual(['workspace-1', 'user-1', 'Architecture', '# System']);
  });

  it('prevents a Viewer from creating documents', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ role: 'viewer' }] });

    await expect(
      service.create('workspace-1', 'viewer-1', { title: 'Not allowed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('updates only a document scoped to the selected workspace', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [documentRow] });

    await expect(
      service.update('workspace-1', 'document-1', 'user-1', { title: 'Architecture' }),
    ).resolves.toMatchObject({ title: 'Architecture' });

    expect(client.query.mock.calls[1][0]).toContain('WHERE id = $1 AND workspace_id = $2');
  });

  it('rejects empty document updates', async () => {
    await expect(
      service.update('workspace-1', 'document-1', 'user-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('returns not found when the document is outside the workspace', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.update('workspace-1', 'document-other', 'user-1', { title: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only a document scoped to the selected workspace', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'document-1' }] });

    await expect(
      service.remove('workspace-1', 'document-1', 'user-1'),
    ).resolves.toBeUndefined();
    expect(client.query.mock.calls[1][0]).toContain('WHERE id = $1 AND workspace_id = $2');
  });
});
