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
import { CanteenPermissionsRegistryService } from './canteen-permissions-registry.service';
import {
  CreateCanteenCustomPermissionDto,
  UpdateCanteenCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard)
@Controller('api/canteen/permissions')
export class CanteenPermissionsRegistryController {
  constructor(private readonly svc: CanteenPermissionsRegistryService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all dynamic permissions from PostgreSQL DB (grouped by resource)',
  })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({
    summary:
      'Register a new dynamic custom permission in PostgreSQL DB (Institute Admin only)',
  })
  createPermission(
    @CanteenUser() actor: CanteenPlatformUser,
    @Body() dto: CreateCanteenCustomPermissionDto,
  ) {
    return this.svc.createPermission(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific dynamic permission details' })
  @ApiParam({
    name: 'id',
    description: 'permission_id of the Dynamic Permission (e.g. 1)',
  })
  getPermission(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPermission(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update dynamic permission details or toggle active status (Institute Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'permission_id of the Dynamic Permission to update (e.g. 1)',
  })
  updatePermission(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCanteenCustomPermissionDto,
  ) {
    return this.svc.updatePermission(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete custom dynamic permission (non-system permissions only, Institute Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'permission_id of the Custom Permission to delete (e.g. 1)',
  })
  deletePermission(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
