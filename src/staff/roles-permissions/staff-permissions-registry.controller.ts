import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { StaffPermissionsRegistryService } from './staff-permissions-registry.service';
import {
  CreateStaffCustomPermissionDto,
  UpdateStaffCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller('api/staff/permissions')
export class StaffPermissionsRegistryController {
  constructor(private readonly svc: StaffPermissionsRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List all Staff permissions from the DB (grouped by resource)',
  })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new custom permission (Institute Admin only)',
  })
  createPermission(
    @StaffUser() actor: StaffPlatformUser,
    @Body() dto: CreateStaffCustomPermissionDto,
  ) {
    return this.svc.createPermission(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific permission details' })
  @ApiParam({ name: 'id', description: 'permission_id (e.g. 1)' })
  getPermission(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPermission(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update permission details or toggle active status (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'permission_id to update (e.g. 1)' })
  updatePermission(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffCustomPermissionDto,
  ) {
    return this.svc.updatePermission(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a custom permission (non-system permissions only, Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'permission_id to delete (e.g. 1)' })
  deletePermission(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
