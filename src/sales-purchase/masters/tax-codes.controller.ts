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
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseInstituteAdminViewOnlyGuard } from '../auth/sales-purchase-institute-admin-view-only.guard';
import { SalesPurchasePermissionsGuard } from '../auth/sales-purchase-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { TaxCodesService } from './tax-codes.service';
import { CreateTaxCodeDto } from './dto/tax-code.dto';

class SetTaxCodeActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  is_active: boolean;
}

@ApiTags('Sales & Purchase / Tax Codes')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/tax-codes')
export class TaxCodesController {
  constructor(private readonly svc: TaxCodesService) {}

  @Post()
  @RequirePermission({ resource: 'masters', action: 'create' })
  @ApiOperation({
    summary: 'Create a new tax code version (never edits an existing one)',
  })
  create(
    @Body() dto: CreateTaxCodeDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'List/search tax code versions' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'masters', action: 'read' })
  @ApiOperation({ summary: 'Get a tax code version' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id/active')
  @RequirePermission({ resource: 'masters', action: 'update' })
  @ApiOperation({
    summary:
      'Activate/retire a tax code version for use in new transactions (rates themselves are immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  setActive(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTaxCodeActiveDto,
  ) {
    return this.svc.setActive(
      user.institute_id,
      id,
      dto.is_active,
      user.eddva_user_id,
    );
  }

  @Delete(':id')
  @RequirePermission({ resource: 'masters', action: 'delete' })
  @ApiOperation({ summary: 'Delete a tax code version (rejected with 409 if referenced by any item/order line — retire via the "active" toggle instead)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
