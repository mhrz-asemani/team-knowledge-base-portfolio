const configuredApiHost = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE = configuredApiHost
  ? `${configuredApiHost.includes('://') ? configuredApiHost : `https://${configuredApiHost}`}`
      .replace(/\/+$/, '')
      .replace(/\/api\/v1$/, '') + '/api/v1'
  : '/api/v1';

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: Array<{ message: string }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isApiErrorBody(payload) ? payload : undefined;
    const validationDetails = error?.details?.map((item) => item.message).filter(Boolean);
    const message = validationDetails?.length
      ? validationDetails.join('، ')
      : error?.message || `درخواست ناموفق بود (HTTP ${response.status}).`;
    throw new ApiError(message, response.status, error?.code);
  }

  return payload as T;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}


export async function apiStream(
  path: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'text/event-stream' },
    });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error = isApiErrorBody(payload) ? payload : undefined;
    throw new ApiError(error?.message || `درخواست ناموفق بود (HTTP ${response.status}).`, response.status, error?.code);
  }
  if (!response.body) throw new ApiError('پاسخ جریانی از سرور دریافت نشد.', 502, 'STREAM_UNAVAILABLE');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!data) continue;
        let event: Record<string, unknown>;
        try { event = JSON.parse(data) as Record<string, unknown>; }
        catch { throw new ApiError('قالب پاسخ جریانی سرور معتبر نیست.', 502, 'INVALID_STREAM'); }
        if (event.type === 'error') {
          throw new ApiError(typeof event.message === 'string' ? event.message : 'خلاصه‌سازی ناموفق بود.', typeof event.status === 'number' ? event.status : 502, 'AI_SUMMARY_FAILED');
        }
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
