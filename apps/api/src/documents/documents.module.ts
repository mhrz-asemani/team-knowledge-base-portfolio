import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AiController } from '../ai/ai.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule, DatabaseModule, AiModule],
  controllers: [DocumentsController, AiController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
