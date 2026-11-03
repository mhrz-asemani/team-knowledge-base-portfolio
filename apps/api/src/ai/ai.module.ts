import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { GROQ_CLIENT } from './groq-client.constants';
import { AiService } from './ai.service';
import type { AiGroqClient } from './ai.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: GROQ_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('GROQ_API_KEY')?.trim();
        return apiKey
          ? (new Groq({ apiKey, timeout: 45_000, maxRetries: 1 }) as unknown as AiGroqClient)
          : null;
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
