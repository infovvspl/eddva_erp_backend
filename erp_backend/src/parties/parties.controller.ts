import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PartiesService } from './parties.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  CreateVendorContactDto,
  UpdateVendorContactDto,
  CreateVendorBankDetailDto,
  UpdateVendorBankDetailDto,
} from './dto/vendor.dto';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateCustomerContactDto,
  UpdateCustomerContactDto,
} from './dto/customer.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Party Management (Vendors & Customers)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  // --- Vendors ---
  @ApiOperation({ summary: 'Create new vendor' })
  @RequirePermission('vendor.create')
  @Post('vendors')
  createVendor(@Body() dto: CreateVendorDto, @GetUser() user: any) {
    return this.partiesService.createVendor(dto, user);
  }

  @ApiOperation({ summary: 'List vendors' })
  @RequirePermission('vendor.view')
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'BLACKLISTED'] })
  @Get('vendors')
  getVendors(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.partiesService.getVendors({ ...query, status }, user);
  }

  @ApiOperation({ summary: 'Get vendor details by ID' })
  @RequirePermission('vendor.view')
  @Get('vendors/:id')
  getVendorById(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.getVendorById(id, user);
  }

  @ApiOperation({ summary: 'Update vendor' })
  @RequirePermission('vendor.edit')
  @Patch('vendors/:id')
  updateVendor(@Param('id') id: string, @Body() dto: UpdateVendorDto, @GetUser() user: any) {
    return this.partiesService.updateVendor(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete vendor' })
  @RequirePermission('vendor.edit')
  @Delete('vendors/:id')
  deleteVendor(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.deleteVendor(id, user);
  }

  // --- Vendor Contacts ---
  @ApiOperation({ summary: 'Get vendor contacts' })
  @RequirePermission('vendor.view')
  @Get('vendors/:id/contacts')
  getVendorContacts(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.getVendorContacts(id, user);
  }

  @ApiOperation({ summary: 'Add contact to vendor' })
  @RequirePermission('vendor.edit')
  @Post('vendors/:id/contacts')
  addVendorContact(
    @Param('id') id: string,
    @Body() dto: CreateVendorContactDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.addVendorContact(id, dto, user);
  }

  @ApiOperation({ summary: 'Update vendor contact' })
  @RequirePermission('vendor.edit')
  @Patch('vendors/:id/contacts/:contactId')
  updateVendorContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateVendorContactDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.updateVendorContact(id, contactId, dto, user);
  }

  @ApiOperation({ summary: 'Delete vendor contact' })
  @RequirePermission('vendor.edit')
  @Delete('vendors/:id/contacts/:contactId')
  deleteVendorContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @GetUser() user: any,
  ) {
    return this.partiesService.deleteVendorContact(id, contactId, user);
  }

  // --- Vendor Bank Details ---
  @ApiOperation({ summary: 'Get vendor bank details' })
  @RequirePermission('vendor.view')
  @Get('vendors/:id/bank-details')
  getVendorBankDetails(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.getVendorBankDetails(id, user);
  }

  @ApiOperation({ summary: 'Add bank detail to vendor' })
  @RequirePermission('vendor.edit')
  @Post('vendors/:id/bank-details')
  addVendorBankDetail(
    @Param('id') id: string,
    @Body() dto: CreateVendorBankDetailDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.addVendorBankDetail(id, dto, user);
  }

  @ApiOperation({ summary: 'Update vendor bank detail' })
  @RequirePermission('vendor.edit')
  @Patch('vendors/:id/bank-details/:bankId')
  updateVendorBankDetail(
    @Param('id') id: string,
    @Param('bankId') bankId: string,
    @Body() dto: UpdateVendorBankDetailDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.updateVendorBankDetail(id, bankId, dto, user);
  }

  @ApiOperation({ summary: 'Delete vendor bank detail' })
  @RequirePermission('vendor.edit')
  @Delete('vendors/:id/bank-details/:bankId')
  deleteVendorBankDetail(
    @Param('id') id: string,
    @Param('bankId') bankId: string,
    @GetUser() user: any,
  ) {
    return this.partiesService.deleteVendorBankDetail(id, bankId, user);
  }

  // --- Customers ---
  @ApiOperation({ summary: 'Create new customer' })
  @RequirePermission('customer.create')
  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto, @GetUser() user: any) {
    return this.partiesService.createCustomer(dto, user);
  }

  @ApiOperation({ summary: 'List customers' })
  @RequirePermission('customer.view')
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @Get('customers')
  getCustomers(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.partiesService.getCustomers({ ...query, status }, user);
  }

  @ApiOperation({ summary: 'Get customer details by ID' })
  @RequirePermission('customer.view')
  @Get('customers/:id')
  getCustomerById(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.getCustomerById(id, user);
  }

  @ApiOperation({ summary: 'Update customer' })
  @RequirePermission('customer.edit')
  @Patch('customers/:id')
  updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @GetUser() user: any) {
    return this.partiesService.updateCustomer(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete customer' })
  @RequirePermission('customer.edit')
  @Delete('customers/:id')
  deleteCustomer(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.deleteCustomer(id, user);
  }

  // --- Customer Contacts ---
  @ApiOperation({ summary: 'Get customer contacts' })
  @RequirePermission('customer.view')
  @Get('customers/:id/contacts')
  getCustomerContacts(@Param('id') id: string, @GetUser() user: any) {
    return this.partiesService.getCustomerContacts(id, user);
  }

  @ApiOperation({ summary: 'Add contact to customer' })
  @RequirePermission('customer.edit')
  @Post('customers/:id/contacts')
  addCustomerContact(
    @Param('id') id: string,
    @Body() dto: CreateCustomerContactDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.addCustomerContact(id, dto, user);
  }

  @ApiOperation({ summary: 'Update customer contact' })
  @RequirePermission('customer.edit')
  @Patch('customers/:id/contacts/:contactId')
  updateCustomerContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateCustomerContactDto,
    @GetUser() user: any,
  ) {
    return this.partiesService.updateCustomerContact(id, contactId, dto, user);
  }

  @ApiOperation({ summary: 'Delete customer contact' })
  @RequirePermission('customer.edit')
  @Delete('customers/:id/contacts/:contactId')
  deleteCustomerContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @GetUser() user: any,
  ) {
    return this.partiesService.deleteCustomerContact(id, contactId, user);
  }
}
