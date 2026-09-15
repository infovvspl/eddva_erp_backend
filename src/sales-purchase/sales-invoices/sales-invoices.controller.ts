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
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { QuerySalesInvoiceDto } from './dto/query-sales-invoice.dto';

@ApiTags('Sales & Purchase / Sales Invoices')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/sales-invoices')
export class SalesInvoicesController {
  constructor(private readonly svc: SalesInvoicesService) {}

  @Post()
  @RequirePermission({ resource: 'sales_invoices', action: 'create' })
  @ApiOperation({
    summary:
      'Create a draft sales invoice (invoice_number generated server-side; totals computed server-side)',
  })
  create(
    @Body() dto: CreateSalesInvoiceDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'sales_invoices', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate sales invoices' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QuerySalesInvoiceDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'sales_invoices', action: 'read' })
  @ApiOperation({ summary: 'Get a sales invoice with items and receipts' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'sales_invoices', action: 'update' })
  @ApiOperation({
    summary: 'Update a DRAFT sales invoice (posted invoices are immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesInvoiceDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/post')
  @RequirePermission({ resource: 'sales_invoices', action: 'post' })
  @ApiOperation({
    summary:
      'Post a DRAFT sales invoice — validates order-quantity matching, then commits atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  post(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.post(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'sales_invoices', action: 'cancel' })
  @ApiOperation({
    summary:
      'Cancel a sales invoice (blocked once receipts are recorded against it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user.institute_id, id, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'sales_invoices', action: 'delete' })
  @ApiOperation({
    summary:
      'Delete a DRAFT sales invoice outright (posted invoices are immutable — use cancel instead)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
