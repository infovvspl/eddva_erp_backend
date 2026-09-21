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
import { AlumniPermissionsRegistryService } from './alumni-permissions-registry.service';
import {
  CreateAlumniCustomPermissionDto,
  UpdateAlumniCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';

@ApiTags('Alumni / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(AlumniJwtGuard)
@Controller('api/alumni/permissions')
export class AlumniPermissionsRegistryController {
  constructor(private readonly svc: AlumniPermissionsRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List all Alumni permissions from the DB (grouped by resource)',
  })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new custom permission (Institute Admin only)',
  })
  createPermission(
    @AlumniUser() actor: AlumniPlatformUser,
    @Body() dto: CreateAlumniCustomPermissionDto,
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
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAlumniCustomPermissionDto,
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
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
