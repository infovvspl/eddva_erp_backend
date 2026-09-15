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
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import {
  ApprovePurchaseOrderDto,
  RejectPurchaseOrderDto,
} from './dto/reject-purchase-order.dto';

@ApiTags('Sales & Purchase / Purchase Orders')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Post()
  @RequirePermission({ resource: 'purchase_orders', action: 'create' })
  @ApiOperation({
    summary:
      'Create a purchase order (po_number generated server-side; totals computed server-side)',
  })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'purchase_orders', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate purchase orders' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QueryPurchaseOrderDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'purchase_orders', action: 'read' })
  @ApiOperation({
    summary: 'Get a purchase order with items and approval history',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'purchase_orders', action: 'update' })
  @ApiOperation({
    summary: 'Update a DRAFT purchase order (rejected once it has left DRAFT)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/submit')
  @RequirePermission({ resource: 'purchase_orders', action: 'submit' })
  @ApiOperation({ summary: 'Submit a DRAFT purchase order for approval' })
  @ApiParam({ name: 'id', example: 1 })
  submit(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.submit(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/approve')
  @RequirePermission({ resource: 'purchase_orders', action: 'approve' })
  @ApiOperation({
    summary:
      'Approve the current tier of a PENDING_APPROVAL purchase order (may require multiple tiers per configured approval rules)',
  })
  @ApiParam({ name: 'id', example: 1 })
  approve(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovePurchaseOrderDto,
  ) {
    return this.svc.approve(user.institute_id, id, user, dto.remarks);
  }

  @Post(':id/reject')
  @RequirePermission({ resource: 'purchase_orders', action: 'reject' })
  @ApiOperation({ summary: 'Reject a PENDING_APPROVAL purchase order' })
  @ApiParam({ name: 'id', example: 1 })
  reject(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectPurchaseOrderDto,
  ) {
    return this.svc.reject(user.institute_id, id, user, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'purchase_orders', action: 'cancel' })
  @ApiOperation({
    summary:
      'Cancel a purchase order (blocked once goods receipt notes exist against it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user.institute_id, id, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'purchase_orders', action: 'delete' })
  @ApiOperation({
    summary:
      'Delete a DRAFT purchase order outright (anything past DRAFT must be cancelled instead, to preserve the audit trail)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
