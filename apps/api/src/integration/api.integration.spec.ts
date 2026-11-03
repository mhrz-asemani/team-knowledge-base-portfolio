import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../http/api-exception.filter';

const API_ORIGIN = 'http://localhost:5173';
const API_PREFIX = '/api/v1';

describe('HTTP integration: authentication, workspaces, membership, and documents', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? databaseUrl;
    if (
      !databaseUrl ||
      databaseUrl !== testDatabaseUrl ||
      !new URL(databaseUrl).pathname.replace(/^\/+/, '').endsWith('_test')
    ) {
      throw new Error(
        'Integration tests require DATABASE_URL and TEST_DATABASE_URL to target the same dedicated *_test database.',
      );
    }

    process.env.WEB_ORIGIN = API_ORIGIN;
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.enableCors({ origin: API_ORIGIN, credentials: true });
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine integration test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}${API_PREFIX}`;
  }, 20_000);

  afterAll(async () => {
    await app?.close();
  });

  async function request(
    path: string,
    options: RequestInit = {},
    cookie?: string,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes((options.method ?? 'GET').toUpperCase())) {
      headers.set('origin', API_ORIGIN);
    }
    if (options.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    if (cookie) headers.set('cookie', cookie);

    return fetch(`${baseUrl}${path}`, { ...options, headers });
  }

  async function registerAndLogin(email: string) {
    const password = 'Integration-test-password-2026';
    const register = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(register.status).toBe(201);

    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);

    const setCookie = login.headers.get('set-cookie');
    expect(setCookie).toContain('sessionToken=');
    const cookie = setCookie!.split(';', 1)[0];
    return { cookie };
  }

  async function createWorkspace(cookie: string, name: string) {
    const response = await request('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, cookie);
    expect(response.status).toBe(201);
    return (await response.json() as {
      workspace: { id: string; role: string };
    }).workspace;
  }

  async function createDocument(
    workspaceId: string,
    cookie: string,
    title: string,
    contentMarkdown = '',
  ) {
    const response = await request(`/workspaces/${workspaceId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title, contentMarkdown }),
    }, cookie);
    expect(response.status).toBe(201);
    return (await response.json() as {
      document: { id: string; title: string; contentMarkdown: string };
    }).document;
  }

  it('supports auth and CRUD while enforcing workspace and membership permissions', async () => {
    const suffix = randomUUID();
    const ownerEmail = `owner-${suffix}@example.test`;
    const memberEmail = `member-${suffix}@example.test`;
    const outsiderEmail = `outsider-${suffix}@example.test`;

    const owner = await registerAndLogin(ownerEmail);
    const member = await registerAndLogin(memberEmail);
    const outsider = await registerAndLogin(outsiderEmail);

    const me = await request('/auth/me', {}, owner.cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email: ownerEmail } });

    const workspace = await createWorkspace(owner.cookie, 'Integration workspace');
    expect(workspace.role).toBe('owner');

    const document = await createDocument(
      workspace.id,
      owner.cookie,
      'Integration document',
      '# Tested',
    );

    const addMember = await request(`/workspaces/${workspace.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail }),
    }, owner.cookie);
    expect(addMember.status).toBe(201);
    const memberResponse = await addMember.json() as {
      member: { userId: string; role: string };
    };
    expect(memberResponse.member.role).toBe('member');

    const memberCanCreate = await createDocument(
      workspace.id,
      member.cookie,
      'Member-created document',
      'Members can write.',
    );

    const memberCannotManageMembership = await request(
      `/workspaces/${workspace.id}/members/${memberResponse.member.userId}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) },
      member.cookie,
    );
    expect(memberCannotManageMembership.status).toBe(403);

    const setViewerRole = await request(
      `/workspaces/${workspace.id}/members/${memberResponse.member.userId}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) },
      owner.cookie,
    );
    expect(setViewerRole.status).toBe(200);
    expect(await setViewerRole.json()).toMatchObject({ member: { role: 'viewer' } });

    const viewerCanRead = await request(`/workspaces/${workspace.id}/documents`, {}, member.cookie);
    expect(viewerCanRead.status).toBe(200);
    const viewerDocuments = await viewerCanRead.json() as {
      documents: Array<{ id: string; title: string }>;
      pagination: { totalItems: number };
    };
    expect(viewerDocuments.documents.map(({ id, title }) => ({ id, title }))).toEqual(
      expect.arrayContaining([
        { id: document.id, title: document.title },
        { id: memberCanCreate.id, title: memberCanCreate.title },
      ]),
    );
    expect(viewerDocuments.pagination).toMatchObject({ totalItems: 2 });

    const viewerCannotCreate = await request(`/workspaces/${workspace.id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Forbidden document' }),
    }, member.cookie);
    expect(viewerCannotCreate.status).toBe(403);

    const viewerCannotUpdate = await request(
      `/workspaces/${workspace.id}/documents/${document.id}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'Tampered title' }) },
      member.cookie,
    );
    expect(viewerCannotUpdate.status).toBe(403);

    const viewerCannotDelete = await request(
      `/workspaces/${workspace.id}/documents/${document.id}`,
      { method: 'DELETE' },
      member.cookie,
    );
    expect(viewerCannotDelete.status).toBe(403);

    const outsiderCannotReadWorkspaceDocuments = await request(
      `/workspaces/${workspace.id}/documents`,
      {},
      outsider.cookie,
    );
    expect(outsiderCannotReadWorkspaceDocuments.status).toBe(404);

    const outsiderCannotReadKnownDocumentId = await request(
      `/workspaces/${workspace.id}/documents/${document.id}`,
      {},
      outsider.cookie,
    );
    expect(outsiderCannotReadKnownDocumentId.status).toBe(404);

    const logout = await request('/auth/logout', { method: 'POST' }, owner.cookie);
    expect(logout.status).toBe(204);
    const meAfterLogout = await request('/auth/me', {}, owner.cookie);
    expect(meAfterLogout.status).toBe(401);
  }, 30_000);

  it('supports document search, allowlisted sorting, and pagination', async () => {
    const suffix = randomUUID();
    const owner = await registerAndLogin(`listing-owner-${suffix}@example.test`);
    const workspace = await createWorkspace(owner.cookie, 'Document listing workspace');

    await createDocument(workspace.id, owner.cookie, 'Gamma', 'unique-search-marker');
    await createDocument(workspace.id, owner.cookie, 'Alpha', 'first document');
    await createDocument(workspace.id, owner.cookie, 'Beta', 'second document');

    const sortedPageOne = await request(
      `/workspaces/${workspace.id}/documents?sort=title&order=asc&page=1&pageSize=1`,
      {},
      owner.cookie,
    );
    expect(sortedPageOne.status).toBe(200);
    expect(await sortedPageOne.json()).toMatchObject({
      documents: [{ title: 'Alpha' }],
      pagination: { page: 1, pageSize: 1, totalItems: 3, totalPages: 3 },
    });

    const sortedPageTwo = await request(
      `/workspaces/${workspace.id}/documents?sort=title&order=asc&page=2&pageSize=1`,
      {},
      owner.cookie,
    );
    expect(await sortedPageTwo.json()).toMatchObject({
      documents: [{ title: 'Beta' }],
      pagination: { page: 2, pageSize: 1, totalItems: 3, totalPages: 3 },
    });

    const searched = await request(
      `/workspaces/${workspace.id}/documents?q=unique-search-marker`,
      {},
      owner.cookie,
    );
    expect(await searched.json()).toMatchObject({
      documents: [{ title: 'Gamma' }],
      pagination: { totalItems: 1, totalPages: 1 },
    });

    const oversizedPage = await request(
      `/workspaces/${workspace.id}/documents?pageSize=101`,
      {},
      owner.cookie,
    );
    expect(oversizedPage.status).toBe(400);
  }, 30_000);
});
