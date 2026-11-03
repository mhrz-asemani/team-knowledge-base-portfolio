import { IsIn } from 'class-validator';

export class UpdateWorkspaceMemberRoleDto {
  @IsIn(['member', 'viewer'])
  role!: 'member' | 'viewer';
}
