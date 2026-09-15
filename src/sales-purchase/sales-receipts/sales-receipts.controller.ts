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
import { SalesReceiptsService } from './sales-receipts.service';
import { CreateSalesReceiptDto } from './dto/create-sales-receipt.dto';
import { UpdateSalesReceiptDto } from './dto/update-sales-receipt.dto';
import { QuerySalesReceiptDto } from './dto/query-sales-receipt.dto';

@ApiTags('Sales & Purchase / Sales Receipts')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/sales-receipts')
export class SalesReceiptsController {
  constructor(private readonly svc: SalesReceiptsService) {}

  @Post()
  @RequirePermission({ resource: 'sales_receipts', action: 'create' })
  @ApiOperation({
    summary:
      'Record a receipt against a POSTED sales invoice (rejected if it would exceed the outstanding balance)',
  })
  create(
    @Body() dto: CreateSalesReceiptDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'sales_receipts', action: 'read' })
  @ApiOperation({ summary: 'List/filter/paginate sales receipts' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QuerySalesReceiptDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'sales_receipts', action: 'read' })
  @ApiOperation({ summary: 'Get a sales receipt' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'sales_receipts', action: 'update' })
  @ApiOperation({
    summary:
      'Update non-financial fields of a receipt (date/mode/reference — amount is immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesReceiptDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'sales_receipts', action: 'delete' })
  @ApiOperation({
    summary:
      'Reverse/delete a sales receipt (recomputes invoice outstanding balance and payment status)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
