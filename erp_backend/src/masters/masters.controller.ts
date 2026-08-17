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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MastersService } from './masters.service';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto';
import { CreateUomDto } from './dto/create-uom.dto';
import { UpdateUomDto } from './dto/update-uom.dto';
import { CreateTaxCodeDto } from './dto/create-tax-code.dto';
import { UpdateTaxCodeDto } from './dto/update-tax-code.dto';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Core Masters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api')
export class MastersController {
  constructor(private readonly mastersService: MastersService) {}

  // --- Item Categories ---
  @ApiOperation({ summary: 'Create item category' })
  @RequirePermission('master.manage')
  @Post('item-categories')
  createCategory(@Body() dto: CreateItemCategoryDto, @GetUser() user: any) {
    return this.mastersService.createCategory(dto, user);
  }

  @ApiOperation({ summary: 'List item categories' })
  @Get('item-categories')
  getCategories(@GetUser() user: any) {
    return this.mastersService.getCategories(user);
  }

  @ApiOperation({ summary: 'Update item category' })
  @RequirePermission('master.manage')
  @Patch('item-categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateItemCategoryDto,
    @GetUser() user: any,
  ) {
    return this.mastersService.updateCategory(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete item category' })
  @RequirePermission('master.manage')
  @Delete('item-categories/:id')
  deleteCategory(@Param('id') id: string, @GetUser() user: any) {
    return this.mastersService.deleteCategory(id, user);
  }

  // --- UOM ---
  @ApiOperation({ summary: 'Create UOM' })
  @RequirePermission('master.manage')
  @Post('uom')
  createUom(@Body() dto: CreateUomDto) {
    return this.mastersService.createUom(dto);
  }

  @ApiOperation({ summary: 'List UOMs' })
  @Get('uom')
  getUoms() {
    return this.mastersService.getUoms();
  }

  @ApiOperation({ summary: 'Update UOM' })
  @RequirePermission('master.manage')
  @Patch('uom/:id')
  updateUom(@Param('id') id: string, @Body() dto: UpdateUomDto) {
    return this.mastersService.updateUom(id, dto);
  }

  @ApiOperation({ summary: 'Delete UOM' })
  @RequirePermission('master.manage')
  @Delete('uom/:id')
  deleteUom(@Param('id') id: string) {
    return this.mastersService.deleteUom(id);
  }

  // --- Tax Codes ---
  @ApiOperation({ summary: 'Create tax code' })
  @RequirePermission('master.manage')
  @Post('tax-codes')
  createTaxCode(@Body() dto: CreateTaxCodeDto) {
    return this.mastersService.createTaxCode(dto);
  }

  @ApiOperation({ summary: 'List tax codes' })
  @Get('tax-codes')
  getTaxCodes() {
    return this.mastersService.getTaxCodes();
  }

  @ApiOperation({ summary: 'Update tax code' })
  @RequirePermission('master.manage')
  @Patch('tax-codes/:id')
  updateTaxCode(@Param('id') id: string, @Body() dto: UpdateTaxCodeDto) {
    return this.mastersService.updateTaxCode(id, dto);
  }

  @ApiOperation({ summary: 'Delete tax code' })
  @RequirePermission('master.manage')
  @Delete('tax-codes/:id')
  deleteTaxCode(@Param('id') id: string) {
    return this.mastersService.deleteTaxCode(id);
  }

  // --- Payment Terms ---
  @ApiOperation({ summary: 'Create payment term' })
  @RequirePermission('master.manage')
  @Post('payment-terms')
  createPaymentTerm(@Body() dto: CreatePaymentTermDto) {
    return this.mastersService.createPaymentTerm(dto);
  }

  @ApiOperation({ summary: 'List payment terms' })
  @Get('payment-terms')
  getPaymentTerms() {
    return this.mastersService.getPaymentTerms();
  }

  @ApiOperation({ summary: 'Update payment term' })
  @RequirePermission('master.manage')
  @Patch('payment-terms/:id')
  updatePaymentTerm(@Param('id') id: string, @Body() dto: UpdatePaymentTermDto) {
    return this.mastersService.updatePaymentTerm(id, dto);
  }

  @ApiOperation({ summary: 'Delete payment term' })
  @RequirePermission('master.manage')
  @Delete('payment-terms/:id')
  deletePaymentTerm(@Param('id') id: string) {
    return this.mastersService.deletePaymentTerm(id);
  }

  // --- Warehouses ---
  @ApiOperation({ summary: 'Create warehouse' })
  @RequirePermission('master.manage')
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto, @GetUser() user: any) {
    return this.mastersService.createWarehouse(dto, user);
  }

  @ApiOperation({ summary: 'List warehouses' })
  @Get('warehouses')
  getWarehouses(@GetUser() user: any) {
    return this.mastersService.getWarehouses(user);
  }

  @ApiOperation({ summary: 'Update warehouse' })
  @RequirePermission('master.manage')
  @Patch('warehouses/:id')
  updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @GetUser() user: any,
  ) {
    return this.mastersService.updateWarehouse(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete warehouse' })
  @RequirePermission('master.manage')
  @Delete('warehouses/:id')
  deleteWarehouse(@Param('id') id: string, @GetUser() user: any) {
    return this.mastersService.deleteWarehouse(id, user);
  }

  // --- Items ---
  @ApiOperation({ summary: 'Create item' })
  @RequirePermission('item.create')
  @Post('items')
  createItem(@Body() dto: CreateItemDto, @GetUser() user: any) {
    return this.mastersService.createItem(dto, user);
  }

  @ApiOperation({ summary: 'List items (paginated & searchable)' })
  @RequirePermission('item.view')
  @Get('items')
  getItems(@Query() query: PaginationQueryDto, @GetUser() user: any) {
    return this.mastersService.getItems(query, user);
  }

  @ApiOperation({ summary: 'Get item details by ID' })
  @RequirePermission('item.view')
  @Get('items/:id')
  getItemById(@Param('id') id: string, @GetUser() user: any) {
    return this.mastersService.getItemById(id, user);
  }

  @ApiOperation({ summary: 'Update item' })
  @RequirePermission('item.edit')
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @GetUser() user: any) {
    return this.mastersService.updateItem(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete item' })
  @RequirePermission('item.edit')
  @Delete('items/:id')
  deleteItem(@Param('id') id: string, @GetUser() user: any) {
    return this.mastersService.deleteItem(id, user);
  }
}
