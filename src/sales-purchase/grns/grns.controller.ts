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
import { GrnsService } from './grns.service';
import { CreateGrnDto } from './dto/create-grn.dto';
import { UpdateGrnDto } from './dto/update-grn.dto';
import { QueryGrnDto } from './dto/query-grn.dto';

@ApiTags('Sales & Purchase / Goods Receipt Notes')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/grns')
export class GrnsController {
  constructor(private readonly svc: GrnsService) {}

  @Post()
  @RequirePermission({ resource: 'grns', action: 'create' })
  @ApiOperation({
    summary:
      'Record a draft GRN against an approved/partially-received purchase order',
  })
  create(
    @Body() dto: CreateGrnDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'grns', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate GRNs' })
  findAll(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: QueryGrnDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'grns', action: 'read' })
  @ApiOperation({ summary: 'Get a GRN with its line items' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'grns', action: 'update' })
  @ApiOperation({ summary: 'Update a DRAFT GRN' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGrnDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/post')
  @RequirePermission({ resource: 'grns', action: 'post' })
  @ApiOperation({
    summary:
      'Post a DRAFT GRN — commits received quantities against the purchase order transactionally',
  })
  @ApiParam({ name: 'id', example: 1 })
  post(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.post(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'grns', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel a DRAFT GRN (a posted GRN is immutable)' })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user.institute_id, id, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'grns', action: 'delete' })
  @ApiOperation({ summary: 'Delete a DRAFT GRN outright (a posted GRN is immutable and cannot be deleted)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
