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
} from '@nestjs/swagger';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseInstituteAdminViewOnlyGuard } from '../auth/sales-purchase-institute-admin-view-only.guard';
import { SalesPurchasePermissionsGuard } from '../auth/sales-purchase-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';

@ApiTags('Sales & Purchase / Sales Orders')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/sales-orders')
export class SalesOrdersController {
  constructor(private readonly svc: SalesOrdersService) {}

  @Post()
  @RequirePermission({ resource: 'sales_orders', action: 'create' })
  @ApiOperation({
    summary:
      'Create a sales order (so_number generated server-side; totals computed server-side)',
  })
  create(
    @Body() dto: CreateSalesOrderDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'sales_orders', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate sales orders' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QuerySalesOrderDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'sales_orders', action: 'read' })
  @ApiOperation({ summary: 'Get a sales order with items' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'sales_orders', action: 'update' })
  @ApiOperation({ summary: 'Update a DRAFT sales order' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesOrderDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/confirm')
  @RequirePermission({ resource: 'sales_orders', action: 'confirm' })
  @ApiOperation({ summary: 'Confirm a DRAFT sales order' })
  @ApiParam({ name: 'id', example: 1 })
  confirm(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.confirm(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'sales_orders', action: 'cancel' })
  @ApiOperation({
    summary: 'Cancel a sales order (blocked once invoices exist against it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user.institute_id, id, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'sales_orders', action: 'delete' })
  @ApiOperation({
    summary:
      'Delete a DRAFT sales order outright (anything past DRAFT must be cancelled instead, to preserve the audit trail)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
