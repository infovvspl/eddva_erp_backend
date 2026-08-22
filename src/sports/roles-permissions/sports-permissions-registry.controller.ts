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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SportsPermissionsRegistryService } from './sports-permissions-registry.service';
import { CreateSportsCustomPermissionDto, UpdateSportsCustomPermissionDto } from './dto/create-custom-permission.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';

@ApiTags('Sports / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard)
@Controller('sports/permissions')
export class SportsPermissionsRegistryController {
  constructor(private readonly svc: SportsPermissionsRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List all dynamic permissions from PostgreSQL DB (grouped by resource)' })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({ summary: 'Register a new dynamic custom permission in PostgreSQL DB (Institute Admin)' })
  createPermission(@Body() dto: CreateSportsCustomPermissionDto) {
    return this.svc.createPermission(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific dynamic permission details' })
  @ApiParam({ name: 'id', description: 'permission_id of the Dynamic Permission (e.g. 1)' })
  getPermission(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPermission(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update dynamic permission details or toggle active status' })
  @ApiParam({ name: 'id', description: 'permission_id of the Dynamic Permission to update (e.g. 1)' })
  updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSportsCustomPermissionDto,
  ) {
    return this.svc.updatePermission(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom dynamic permission (non-system permissions only)' })
  @ApiParam({ name: 'id', description: 'permission_id of the Custom Permission to delete (e.g. 1)' })
  deletePermission(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePermission(id);
  }
}
