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
import { PurchasePaymentsService } from './purchase-payments.service';
import { CreatePurchasePaymentDto } from './dto/create-purchase-payment.dto';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { QueryPurchasePaymentDto } from './dto/query-purchase-payment.dto';

@ApiTags('Sales & Purchase / Purchase Payments')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/purchase-payments')
export class PurchasePaymentsController {
  constructor(private readonly svc: PurchasePaymentsService) {}

  @Post()
  @RequirePermission({ resource: 'purchase_payments', action: 'create' })
  @ApiOperation({
    summary:
      'Record a payment against a POSTED purchase invoice (rejected if it would exceed the outstanding balance)',
  })
  create(
    @Body() dto: CreatePurchasePaymentDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'purchase_payments', action: 'read' })
  @ApiOperation({ summary: 'List/filter/paginate purchase payments' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QueryPurchasePaymentDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'purchase_payments', action: 'read' })
  @ApiOperation({ summary: 'Get a purchase payment' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'purchase_payments', action: 'update' })
  @ApiOperation({
    summary:
      'Update non-financial fields of a payment (date/mode/reference — amount is immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchasePaymentDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'purchase_payments', action: 'delete' })
  @ApiOperation({
    summary:
      'Reverse/delete a purchase payment (recomputes invoice outstanding balance and payment status)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
