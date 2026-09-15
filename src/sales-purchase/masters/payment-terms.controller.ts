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
import { PaymentTermsService } from './payment-terms.service';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
} from './dto/payment-term.dto';

@ApiTags('Sales & Purchase / Payment Terms')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/payment-terms')
export class PaymentTermsController {
  constructor(private readonly svc: PaymentTermsService) {}

  @Post()
  @RequirePermission({ resource: 'masters', action: 'create' })
  @ApiOperation({ summary: 'Create a payment term' })
  create(
    @Body() dto: CreatePaymentTermDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'List/search payment terms' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'Get a payment term' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'masters', action: 'update' })
  @ApiOperation({ summary: 'Update a payment term' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentTermDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'masters', action: 'delete' })
  @ApiOperation({ summary: 'Delete a payment term (rejected with 409 if any vendor/customer still references it)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
