import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { VendorsService } from './vendors.service';
import {
  CreateVendorBankDetailDto,
  UpdateVendorBankDetailDto,
} from './dto/vendor-bank-detail.dto';

@ApiTags('Sales & Purchase / Vendor Bank Details')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/vendors/:vendorId/bank-details')
export class VendorBankDetailsController {
  constructor(private readonly svc: VendorsService) {}

  @Post()
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({
    summary:
      'Add a vendor bank account (marking it primary unsets any previous primary account)',
  })
  @ApiParam({ name: 'vendorId', example: 1 })
  create(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Body() dto: CreateVendorBankDetailDto,
  ) {
    return this.svc.addBankDetail(
      user.institute_id,
      vendorId,
      dto,
      user.eddva_user_id,
    );
  }

  @Get()
  @RequirePermission({ resource: 'vendors', action: 'read' })
  @ApiOperation({
    summary: "List a vendor's bank accounts (account numbers masked)",
  })
  @ApiParam({ name: 'vendorId', example: 1 })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
  ) {
    return this.svc.listBankDetails(user.institute_id, vendorId);
  }

  @Patch(':bankId')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Update a vendor bank account' })
  @ApiParam({ name: 'vendorId', example: 1 })
  @ApiParam({ name: 'bankId', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Param('bankId', ParseIntPipe) bankId: number,
    @Body() dto: UpdateVendorBankDetailDto,
  ) {
    return this.svc.updateBankDetail(
      user.institute_id,
      vendorId,
      bankId,
      dto,
      user.eddva_user_id,
    );
  }

  @Delete(':bankId')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Remove a vendor bank account' })
  @ApiParam({ name: 'vendorId', example: 1 })
  @ApiParam({ name: 'bankId', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Param('bankId', ParseIntPipe) bankId: number,
  ) {
    return this.svc.removeBankDetail(
      user.institute_id,
      vendorId,
      bankId,
      user.eddva_user_id,
    );
  }
}
