import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CoreUsersService } from './core-users.service';

const MANAGE_USERS_PERMISSION = 'institute_admin.users.manage';

function assertCanManageUsers(user: any) {
  const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
  if (!permissions.includes(MANAGE_USERS_PERMISSION)) {
    throw new ForbiddenException('You do not have permission to manage institute users');
  }
}

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class CoreUsersController {
  constructor(private readonly service: CoreUsersService) {}

  @Get()
  list(@GetUser() user: any) {
    assertCanManageUsers(user);
    return this.service.list(user);
  }

  @Patch(':id/admin-role')
  setAdminRole(@GetUser() user: any, @Param('id') id: string, @Body('isAdmin') isAdmin: boolean) {
    assertCanManageUsers(user);
    return this.service.setAdminRole(user, id, !!isAdmin);
  }
}
