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
import { HostelPermissionsRegistryService } from './hostel-permissions-registry.service';
import {
  CreateHostelCustomPermissionDto,
  UpdateHostelCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';

@ApiTags('Hostel / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(HostelJwtGuard)
@Controller('api/hostel/permissions')
export class HostelPermissionsRegistryController {
  constructor(private readonly svc: HostelPermissionsRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List all Hostel permissions from the DB (grouped by resource)',
  })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new custom permission (Institute Admin only)',
  })
  createPermission(
    @HostelUser() actor: HostelPlatformUser,
    @Body() dto: CreateHostelCustomPermissionDto,
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
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelCustomPermissionDto,
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
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
