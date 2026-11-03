import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const workspaces = await this.workspacesService.listForUser(user.id);
    return { workspaces };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateWorkspaceDto,
  ) {
    const workspace = await this.workspacesService.create(user.id, input);
    return { workspace };
  }

  @Get(':workspaceId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    const workspace = await this.workspacesService.getForUser(
      workspaceId,
      user.id,
    );
    return { workspace };
  }
}
