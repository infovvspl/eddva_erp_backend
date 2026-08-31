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
import { InventoryPermissionsRegistryService } from './inventory-permissions-registry.service';
import { CreateInventoryCustomPermissionDto, UpdateInventoryCustomPermissionDto } from './dto/create-custom-permission.dto';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';

@ApiTags('Inventory / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard)
@Controller('api/inventory/permissions')
export class InventoryPermissionsRegistryController {
  constructor(private readonly svc: InventoryPermissionsRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List all dynamic permissions from PostgreSQL DB (grouped by resource)' })
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({ summary: 'Register a new dynamic custom permission in PostgreSQL DB (Institute Admin)' })
  createPermission(@Body() dto: CreateInventoryCustomPermissionDto) {
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
  updatePermission(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInventoryCustomPermissionDto) {
    return this.svc.updatePermission(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom dynamic permission (non-system permissions only)' })
  @ApiParam({ name: 'id', description: 'permission_id of the Custom Permission to delete (e.g. 1)' })
  deletePermission(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePermission(id);
  }
}
