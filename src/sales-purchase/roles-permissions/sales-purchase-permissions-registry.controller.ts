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
import { SalesPurchasePermissionsRegistryService } from './sales-purchase-permissions-registry.service';
import {
  CreateSalesPurchaseCustomPermissionDto,
  UpdateSalesPurchaseCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';

@ApiTags('Sales & Purchase / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(SalesPurchaseJwtGuard)
@Controller('api/sales-purchase/permissions')
export class SalesPurchasePermissionsRegistryController {
  constructor(private readonly svc: SalesPurchasePermissionsRegistryService) {}

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
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Body() dto: CreateSalesPurchaseCustomPermissionDto,
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
    summary: 'Update dynamic permission details or toggle active status (Institute Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'permission_id of the Dynamic Permission to update (e.g. 1)',
  })
  updatePermission(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesPurchaseCustomPermissionDto,
  ) {
    return this.svc.updatePermission(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete custom dynamic permission (non-system permissions only, Institute Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'permission_id of the Custom Permission to delete (e.g. 1)',
  })
  deletePermission(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePermission(actor, id);
  }
}
