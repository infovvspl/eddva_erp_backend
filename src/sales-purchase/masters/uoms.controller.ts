import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseInstituteAdminViewOnlyGuard } from '../auth/sales-purchase-institute-admin-view-only.guard';
import { SalesPurchasePermissionsGuard } from '../auth/sales-purchase-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { UomsService } from './uoms.service';
import { CreateUomDto, UpdateUomDto } from './dto/uom.dto';

@ApiTags('Sales & Purchase / Units of Measure')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/uoms')
export class UomsController {
  constructor(private readonly svc: UomsService) {}

  @Post()
  @RequirePermission({ resource: 'masters', action: 'create' })
  @ApiOperation({ summary: 'Create a unit of measure' })
  create(
    @Body() dto: CreateUomDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'List/search units of measure' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'Get a unit of measure' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'masters', action: 'update' })
  @ApiOperation({ summary: 'Update/deactivate a unit of measure' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUomDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'masters', action: 'delete' })
  @ApiOperation({ summary: 'Delete a unit of measure (rejected with 409 if any items still reference it)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
