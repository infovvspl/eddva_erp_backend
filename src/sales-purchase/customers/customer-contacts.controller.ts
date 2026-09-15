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
import { CustomersService } from './customers.service';
import {
  CreateCustomerContactDto,
  UpdateCustomerContactDto,
} from './dto/customer-contact.dto';

@ApiTags('Sales & Purchase / Customer Contacts')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/customers/:customerId/contacts')
export class CustomerContactsController {
  constructor(private readonly svc: CustomersService) {}

  @Post()
  @RequirePermission({ resource: 'customers', action: 'update' })
  @ApiOperation({ summary: 'Add a customer contact' })
  @ApiParam({ name: 'customerId', example: 1 })
  create(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: CreateCustomerContactDto,
  ) {
    return this.svc.addContact(
      user.institute_id,
      customerId,
      dto,
      user.eddva_user_id,
    );
  }

  @Get()
  @RequirePermission({ resource: 'customers', action: 'read' })
  @ApiOperation({ summary: "List a customer's contacts" })
  @ApiParam({ name: 'customerId', example: 1 })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('customerId', ParseIntPipe) customerId: number,
  ) {
    return this.svc.listContacts(user.institute_id, customerId);
  }

  @Patch(':contactId')
  @RequirePermission({ resource: 'customers', action: 'update' })
  @ApiOperation({ summary: 'Update a customer contact' })
  @ApiParam({ name: 'customerId', example: 1 })
  @ApiParam({ name: 'contactId', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: UpdateCustomerContactDto,
  ) {
    return this.svc.updateContact(
      user.institute_id,
      customerId,
      contactId,
      dto,
      user.eddva_user_id,
    );
  }

  @Delete(':contactId')
  @RequirePermission({ resource: 'customers', action: 'update' })
  @ApiOperation({ summary: 'Remove a customer contact' })
  @ApiParam({ name: 'customerId', example: 1 })
  @ApiParam({ name: 'contactId', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('customerId', ParseIntPipe) customerId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    return this.svc.removeContact(
      user.institute_id,
      customerId,
      contactId,
      user.eddva_user_id,
    );
  }
}
