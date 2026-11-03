import { BadRequestException, BadGatewayException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService, estimateCostUsd, estimateInputTokensUpperBound, extractPartialStringField, parseDocumentSummary } from './ai.service';
import type { AiGroqClient } from './ai.service';

describe('AiService', () => {
  const settings: Record<string, string> = {
    GROQ_MODEL: 'openai/gpt-oss-120b',
    GROQ_INPUT_COST_PER_MILLION_USD: '0.15',
    GROQ_OUTPUT_COST_PER_MILLION_USD: '0.6',
    GROQ_MAX_REQUEST_COST_USD: '0.01',
  };
  const config = { get: vi.fn((key: string) => settings[key]) };
  const document = {
    id: 'document-1',
    workspaceId: 'workspace-1',
    title: 'Architecture',
    contentMarkdown: '# Architecture\n\nA small service with clear boundaries.',
  };

  function createService(chunks: Array<Record<string, unknown>> = []) {
    const stream = {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const client = {
      chat: { completions: { create: vi.fn().mockResolvedValue(stream) } },
    };
    return {
      service: new AiService(client as unknown as AiGroqClient, config as unknown as ConfigService),
      client,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('validates structured output and records streaming usage', async () => {
    const output = JSON.stringify({
      summary: 'این سند معماری یک سرویس کوچک با مرزبندی روشن را توضیح می‌دهد.',
      keyPoints: ['سرویس‌ها مرز مشخص دارند.'],
      actionItems: ['مرزهای سرویس را مستند کنید.'],
    });
    const { service, client } = createService([
      { choices: [{ delta: { content: output.slice(0, 30) } }] },
      { choices: [{ delta: { content: output.slice(30) } }], usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 } },
    ]);
    const progress = vi.fn();

    const result = await service.summarizeDocument(document, progress, new AbortController().signal);

    expect(result.summary).toContain('معماری');
    expect(result.keyPoints).toHaveLength(1);
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 60, totalTokens: 160, estimatedCostUsd: 0.000051 });
    expect(progress).toHaveBeenCalledWith({ receivedCharacters: output.length, partialSummary: 'این سند معماری یک سرویس کوچک با مرزبندی روشن را توضیح می‌دهد.' });
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true, response_format: { type: 'json_object' } }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects empty and oversized documents before calling the provider', async () => {
    const { service, client } = createService();
    await expect(service.summarizeDocument({ ...document, contentMarkdown: ' ' }, vi.fn(), new AbortController().signal))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.summarizeDocument({ ...document, contentMarkdown: 'x'.repeat(20_001) }, vi.fn(), new AbortController().signal))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it('rejects a request before calling Groq when its conservative maximum cost exceeds the cap', async () => {
    settings.GROQ_MAX_REQUEST_COST_USD = '0.000001';
    const { service, client } = createService();

    await expect(service.summarizeDocument(document, vi.fn(), new AbortController().signal))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(client.chat.completions.create).not.toHaveBeenCalled();
    settings.GROQ_MAX_REQUEST_COST_USD = '0.01';
  });

  it('uses a UTF-8 byte upper bound and computes the maximum request cost', () => {
    expect(estimateInputTokensUpperBound('سلام')).toBeGreaterThan('سلام'.length);
    expect(estimateCostUsd(1_000, 1_200, 0.15, 0.6)).toBe(0.00087);
  });

  it('maps provider rate limits to HTTP 429', async () => {
    const { service, client } = createService();
    client.chat.completions.create.mockRejectedValue({ status: 429 });
    let caught: unknown;
    try {
      await service.summarizeDocument(document, vi.fn(), new AbortController().signal);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(429);
  });

  it('rejects invalid provider JSON instead of returning unvalidated output', async () => {
    const { service } = createService([
      { choices: [{ delta: { content: '{"summary":"too short","keyPoints":[],"actionItems":[]}' } }] },
    ]);
    await expect(service.summarizeDocument(document, vi.fn(), new AbortController().signal))
      .rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails safely when the provider key is not configured', async () => {
    const service = new AiService(null, config as unknown as ConfigService);
    await expect(service.summarizeDocument(document, vi.fn(), new AbortController().signal))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('extracts a partial summary from incomplete streamed JSON', () => {
    expect(extractPartialStringField('{"summary":"این یک خلاصه در حال تولید', 'summary')).toBe('این یک خلاصه در حال تولید');
  });

  it('rejects malformed or incomplete structured output', () => {
    expect(() => parseDocumentSummary('{"summary":"short","keyPoints":[],"actionItems":[]}')).toThrow();
    expect(() => parseDocumentSummary('not json')).toThrow();
  });
});
