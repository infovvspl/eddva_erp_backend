import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  PurchaseRegisterQueryDto,
  SalesRegisterQueryDto,
} from './dto/register-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Register Reports (Read-Only)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({ summary: 'Get Purchase Register (Posted Invoices Read-Only)' })
  @RequirePermission('purchase_register.view')
  @Get('purchase-register')
  getPurchaseRegister(@Query() query: PurchaseRegisterQueryDto, @GetUser() user: any) {
    return this.reportsService.getPurchaseRegister(query, user);
  }

  @ApiOperation({ summary: 'Get Sales Register (Posted Invoices Read-Only)' })
  @RequirePermission('sales_register.view')
  @Get('sales-register')
  getSalesRegister(@Query() query: SalesRegisterQueryDto, @GetUser() user: any) {
    return this.reportsService.getSalesRegister(query, user);
  }
}
