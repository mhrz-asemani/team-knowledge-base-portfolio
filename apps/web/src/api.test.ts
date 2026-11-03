import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, apiStream } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('apiRequest', () => {
  it('sends requests to the versioned API with session credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest<{ user: { id: string } }>('/auth/me')).resolves.toEqual({
      user: { id: 'user-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({
      credentials: 'include',
      headers: expect.any(Headers),
    }));
  });

  it('supports a configured API base URL for separate frontend and API deployments', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'api.example.onrender.com');
    vi.resetModules();
    const { apiRequest: configuredApiRequest } = await import('./api');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await configuredApiRequest('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.onrender.com/api/v1/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('serializes JSON bodies and sets the content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace: { id: 'workspace-1' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Engineering' }),
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Engineering' }),
      credentials: 'include',
    }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('converts API validation details into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ message: 'title must not be empty' }, { message: 'content is too long' }],
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(apiRequest('/workspaces')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'title must not be empty، content is too long',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('preserves authentication status and message for API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unauthenticated',
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('maps network failures to a typed, user-readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.',
    });
  });
});


describe('apiStream', () => {
  it('parses SSE events when frames are split across network chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"type":"started"}\n\ndata: {"type":"progress","receivedCharacters":5,',
      '"partialSummary":"سلام"}\n\ndata: {"type":"complete","result":{"summary":"خلاصه"}}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const events: Array<Record<string, unknown>> = [];

    await apiStream('/workspaces/workspace-1/documents/document-1/summarize', (event) => events.push(event));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/workspace-1/documents/document-1/summarize',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'text/event-stream' },
      }),
    );
    expect(events).toEqual([
      { type: 'started' },
      { type: 'progress', receivedCharacters: 5, partialSummary: 'سلام' },
      { type: 'complete', result: { summary: 'خلاصه' } },
    ]);
  });

  it('maps streamed provider errors to typed API errors', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"error","status":429,"message":"سهمیه تمام شده"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(apiStream('/summary', vi.fn())).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      code: 'AI_SUMMARY_FAILED',
      message: 'سهمیه تمام شده',
    });
  });

  it('rejects malformed SSE payloads', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {invalid json}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(apiStream('/summary', vi.fn())).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'INVALID_STREAM',
    });
  });

  it('preserves HTTP errors returned before the stream starts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Unauthenticated', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(apiStream('/summary', vi.fn())).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthenticated',
    });
  });
});
