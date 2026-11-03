import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documentsService.list(workspaceId, user.id, query);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() input: CreateDocumentDto,
  ) {
    const document = await this.documentsService.create(workspaceId, user.id, input);
    return { document };
  }

  @Get(':documentId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    const document = await this.documentsService.get(workspaceId, documentId, user.id);
    return { document };
  }

  @Patch(':documentId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() input: UpdateDocumentDto,
  ) {
    const document = await this.documentsService.update(
      workspaceId,
      documentId,
      user.id,
      input,
    );
    return { document };
  }

  @Delete(':documentId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    await this.documentsService.remove(workspaceId, documentId, user.id);
    return { success: true };
  }
}
