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
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { QueryPurchaseInvoiceDto } from './dto/query-purchase-invoice.dto';

@ApiTags('Sales & Purchase / Purchase Invoices')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly svc: PurchaseInvoicesService) {}

  @Post()
  @RequirePermission({ resource: 'purchase_invoices', action: 'create' })
  @ApiOperation({
    summary:
      'Create a draft purchase invoice (invoice_number generated server-side; totals computed server-side)',
  })
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'purchase_invoices', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate purchase invoices' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QueryPurchaseInvoiceDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'purchase_invoices', action: 'read' })
  @ApiOperation({ summary: 'Get a purchase invoice with items and payments' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'purchase_invoices', action: 'update' })
  @ApiOperation({
    summary: 'Update a DRAFT purchase invoice (posted invoices are immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseInvoiceDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/post')
  @RequirePermission({ resource: 'purchase_invoices', action: 'post' })
  @ApiOperation({
    summary:
      'Post a DRAFT purchase invoice — runs the three-way match, then commits atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  post(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.post(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'purchase_invoices', action: 'cancel' })
  @ApiOperation({
    summary:
      'Cancel a purchase invoice (blocked once payments are recorded against it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user.institute_id, id, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'purchase_invoices', action: 'delete' })
  @ApiOperation({
    summary:
      'Delete a DRAFT purchase invoice outright (posted invoices are immutable — use cancel instead)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
