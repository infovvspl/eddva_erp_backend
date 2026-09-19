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
import { AdmissionPermissionsRegistryService } from './admission-permissions-registry.service';
import {
  CreateAdmissionCustomPermissionDto,
  UpdateAdmissionCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';

@ApiTags('Admission / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(AdmissionJwtGuard)
@Controller('api/admission/permissions')
export class AdmissionPermissionsRegistryController {
  constructor(private readonly svc: AdmissionPermissionsRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List all Admission permissions from the DB (grouped by resource)',
  })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new custom permission (Institute Admin only)',
  })
  createPermission(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Body() dto: CreateAdmissionCustomPermissionDto,
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
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionCustomPermissionDto,
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
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
