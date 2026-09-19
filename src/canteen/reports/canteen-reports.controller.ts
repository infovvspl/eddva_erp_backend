import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CanteenReportsService } from './canteen-reports.service';
import { CanteenReportQueryDto } from './dto/canteen-report-query.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Canteen Reports & Analytics')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard, CanteenPermissionsGuard)
@Controller('api/canteen/reports')
export class CanteenReportsController {
  constructor(private readonly reportsService: CanteenReportsService) {}

  @ApiOperation({ summary: 'Overall Canteen Sales Report' })
  @RequirePermission({ resource: 'reports', action: 'read' })
  @Get('sales')
  async getSalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getSalesReport(query);
  }

  @ApiOperation({ summary: 'Item-level Sales Performance Report' })
  @RequirePermission({ resource: 'reports', action: 'read' })
  @Get('item-sales')
  async getItemSalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getItemSalesReport(query);
  }

  @ApiOperation({ summary: 'Category-level Sales Breakdown Report' })
  @RequirePermission({ resource: 'reports', action: 'read' })
  @Get('category-sales')
  async getCategorySalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getCategorySalesReport(query);
  }

  @ApiOperation({ summary: 'Payment Method Summary Report' })
  @RequirePermission({ resource: 'reports', action: 'read' })
  @Get('payment-summary')
  async getPaymentSummaryReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getPaymentSummaryReport(query);
  }

  @ApiOperation({ summary: 'POS Shift Reconciliation Report' })
  @RequirePermission({ resource: 'reports', action: 'read' })
  @Get('shifts')
  async getShiftReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getShiftReport(query);
  }
}
