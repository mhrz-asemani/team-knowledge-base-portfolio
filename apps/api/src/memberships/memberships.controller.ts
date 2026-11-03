import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';
import { MembershipsService } from './memberships.service';

@Controller('workspaces/:workspaceId/members')
@UseGuards(SessionGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    const members = await this.membershipsService.list(workspaceId, user.id);
    return { members };
  }

  @Post()
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() input: AddWorkspaceMemberDto,
  ) {
    const member = await this.membershipsService.add(
      workspaceId,
      user.id,
      input,
    );
    return { member };
  }

  @Patch(':userId')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateWorkspaceMemberRoleDto,
  ) {
    const member = await this.membershipsService.updateRole(
      workspaceId,
      user.id,
      userId,
      input,
    );
    return { member };
  }

  @Delete(':userId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    await this.membershipsService.remove(workspaceId, user.id, userId);
    return { success: true };
  }
}
