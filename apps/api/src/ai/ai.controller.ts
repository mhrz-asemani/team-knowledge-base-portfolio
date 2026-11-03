import {
  Controller,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedUser, SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiService } from './ai.service';
import { DocumentsService } from '../documents/documents.service';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(SessionGuard)
export class AiController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ai: AiService,
  ) {}

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post(':documentId/summarize')
  async summarize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    // Fetching through DocumentsService enforces workspace membership before opening the stream.
    const document = await this.documents.get(workspaceId, documentId, user.id);
    const abortController = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) abortController.abort();
    });
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const send = (event: Record<string, unknown>) => {
      if (!abortController.signal.aborted && !response.destroyed) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    send({ type: 'started' });
    try {
      const result = await this.ai.summarizeDocument(
        document,
        (progress) => send({ type: 'progress', ...progress }),
        abortController.signal,
      );
      send({ type: 'complete', result });
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message = error instanceof HttpException
          ? extractHttpMessage(error)
          : 'خلاصه‌سازی با خطا مواجه شد. دوباره تلاش کنید.';
        send({ type: 'error', message, status: error instanceof HttpException ? error.getStatus() : 502 });
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }
}

function extractHttpMessage(error: HttpException): string {
  const payload = error.getResponse();
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = payload.message;
    if (typeof message === 'string') return message;
  }
  return 'خلاصه‌سازی با خطا مواجه شد. دوباره تلاش کنید.';
}
