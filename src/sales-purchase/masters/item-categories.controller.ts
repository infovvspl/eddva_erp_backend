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
import { ItemCategoriesService } from './item-categories.service';
import {
  CreateItemCategoryDto,
  UpdateItemCategoryDto,
} from './dto/item-category.dto';

@ApiTags('Sales & Purchase / Item Categories')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/item-categories')
export class ItemCategoriesController {
  constructor(private readonly svc: ItemCategoriesService) {}

  @Post()
  @RequirePermission({ resource: 'masters', action: 'create' })
  @ApiOperation({ summary: 'Create an item category' })
  create(
    @Body() dto: CreateItemCategoryDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'List/search item categories' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'Get an item category' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'masters', action: 'update' })
  @ApiOperation({ summary: 'Update/deactivate an item category' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemCategoryDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'masters', action: 'delete' })
  @ApiOperation({ summary: 'Delete an item category (rejected with 409 if any items still reference it)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
