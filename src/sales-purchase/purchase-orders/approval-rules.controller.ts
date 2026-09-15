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
import { ApprovalRulesService } from './approval-rules.service';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/approval-rule.dto';

@ApiTags('Sales & Purchase / PO Approval Rules')
@ApiBearerAuth()
@UseGuards(
  SalesPurchaseJwtGuard,
  SalesPurchaseInstituteAdminViewOnlyGuard,
  SalesPurchasePermissionsGuard,
)
@Controller('api/sales-purchase/approval-rules')
export class ApprovalRulesController {
  constructor(private readonly svc: ApprovalRulesService) {}

  @Post()
  @RequirePermission({ resource: 'approval_rules', action: 'create' })
  @ApiOperation({
    summary:
      'Create a PO approval amount-threshold rule (never hardcoded in application logic)',
  })
  create(
    @Body() dto: CreateApprovalRuleDto,
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
  ) {
    return this.svc.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'approval_rules', action: 'read' })
  @ApiOperation({ summary: 'List approval rules' })
  findAll(@SalesPurchaseUser() user: SalesPurchasePlatformUser) {
    return this.svc.findAll(user.institute_id);
  }

  @Get(':id')
  @RequirePermission({ resource: 'approval_rules', action: 'read' })
  @ApiOperation({ summary: 'Get an approval rule' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'approval_rules', action: 'update' })
  @ApiOperation({ summary: 'Update an approval rule' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApprovalRuleDto,
  ) {
    return this.svc.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'approval_rules', action: 'delete' })
  @ApiOperation({ summary: 'Delete an approval rule' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user.institute_id, id, user.eddva_user_id);
  }
}
