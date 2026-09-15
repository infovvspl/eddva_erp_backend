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
  CreateVendorContactDto,
  UpdateVendorContactDto,
} from './dto/vendor-contact.dto';

@ApiTags('Sales & Purchase / Vendor Contacts')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/vendors/:vendorId/contacts')
export class VendorContactsController {
  constructor(private readonly svc: VendorsService) {}

  @Post()
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Add a vendor contact' })
  @ApiParam({ name: 'vendorId', example: 1 })
  create(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Body() dto: CreateVendorContactDto,
  ) {
    return this.svc.addContact(
      user.institute_id,
      vendorId,
      dto,
      user.eddva_user_id,
    );
  }

  @Get()
  @RequirePermission({ resource: 'vendors', action: 'read' })
  @ApiOperation({ summary: "List a vendor's contacts" })
  @ApiParam({ name: 'vendorId', example: 1 })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
  ) {
    return this.svc.listContacts(user.institute_id, vendorId);
  }

  @Patch(':contactId')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Update a vendor contact' })
  @ApiParam({ name: 'vendorId', example: 1 })
  @ApiParam({ name: 'contactId', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: UpdateVendorContactDto,
  ) {
    return this.svc.updateContact(
      user.institute_id,
      vendorId,
      contactId,
      dto,
      user.eddva_user_id,
    );
  }

  @Delete(':contactId')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Remove a vendor contact' })
  @ApiParam({ name: 'vendorId', example: 1 })
  @ApiParam({ name: 'contactId', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    return this.svc.removeContact(
      user.institute_id,
      vendorId,
      contactId,
      user.eddva_user_id,
    );
  }
}
