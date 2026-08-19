import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CanteenReportsService } from './canteen-reports.service';
import { CanteenReportQueryDto } from './dto/canteen-report-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';

@ApiTags('Canteen Reports & Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen/reports')
export class CanteenReportsController {
  constructor(private readonly reportsService: CanteenReportsService) {}

  @ApiOperation({ summary: 'Overall Canteen Sales Report' })
  @RequireCanteenPermission('canteen.report.sales')
  @Get('sales')
  async getSalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getSalesReport(query);
  }

  @ApiOperation({ summary: 'Item-level Sales Performance Report' })
  @RequireCanteenPermission('canteen.report.item_sales')
  @Get('item-sales')
  async getItemSalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getItemSalesReport(query);
  }

  @ApiOperation({ summary: 'Category-level Sales Breakdown Report' })
  @RequireCanteenPermission('canteen.report.category_sales')
  @Get('category-sales')
  async getCategorySalesReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getCategorySalesReport(query);
  }

  @ApiOperation({ summary: 'Payment Method Summary Report' })
  @RequireCanteenPermission('canteen.report.payment_summary')
  @Get('payment-summary')
  async getPaymentSummaryReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getPaymentSummaryReport(query);
  }

  @ApiOperation({ summary: 'POS Shift Reconciliation Report' })
  @RequireCanteenPermission('canteen.report.shift')
  @Get('shifts')
  async getShiftReport(@Query() query: CanteenReportQueryDto) {
    return this.reportsService.getShiftReport(query);
  }
}
