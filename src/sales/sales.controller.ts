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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { PdfService } from '../pdf/pdf.service';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import {
  CreateSalesInvoiceDto,
  UpdateSalesInvoiceDto,
  CreateSalesReceiptDto,
  UpdateSalesReceiptDto,
} from './dto/sales-invoice.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Sales Workflow (SO, Invoices, Receipts)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly pdfService: PdfService,
  ) {}

  // --- Sales Orders ---
  @ApiOperation({ summary: 'Create draft Sales Order' })
  @RequirePermission('sales_order.create')
  @Post('sales-orders')
  createSo(@Body() dto: CreateSalesOrderDto, @GetUser() user: any) {
    return this.salesService.createSo(dto, user);
  }

  @ApiOperation({ summary: 'List Sales Orders' })
  @RequirePermission('sales_order.view')
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @Get('sales-orders')
  getSos(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: any,
  ) {
    return this.salesService.getSos({ ...query, customerId, status }, user);
  }

  @ApiOperation({ summary: 'Get Sales Order details by ID' })
  @RequirePermission('sales_order.view')
  @Get('sales-orders/:id')
  getSoById(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.getSoById(id, user);
  }

  @ApiOperation({ summary: 'Confirm Sales Order' })
  @RequirePermission('sales_order.confirm')
  @Post('sales-orders/:id/confirm')
  confirmSo(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.confirmSo(id, user);
  }

  @ApiOperation({ summary: 'Cancel Sales Order' })
  @RequirePermission('sales_order.cancel')
  @Post('sales-orders/:id/cancel')
  cancelSo(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.cancelSo(id, user);
  }

  @ApiOperation({ summary: 'Update draft Sales Order' })
  @RequirePermission('sales_order.edit')
  @Patch('sales-orders/:id')
  updateSo(
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
    @GetUser() user: any,
  ) {
    return this.salesService.updateSo(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete draft Sales Order' })
  @RequirePermission('sales_order.edit')
  @Delete('sales-orders/:id')
  deleteSo(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.deleteSo(id, user);
  }

  // --- Sales Invoices ---
  @ApiOperation({ summary: 'Create draft Sales Invoice' })
  @RequirePermission('sales_invoice.create')
  @Post('sales-invoices')
  createSalesInvoice(
    @Body() dto: CreateSalesInvoiceDto,
    @GetUser() user: any,
  ) {
    return this.salesService.createSalesInvoice(dto, user);
  }

  @ApiOperation({ summary: 'Update draft Sales Invoice' })
  @RequirePermission('sales_invoice.create')
  @Patch('sales-invoices/:id')
  updateSalesInvoice(
    @Param('id') id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @GetUser() user: any,
  ) {
    return this.salesService.updateSalesInvoice(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete draft Sales Invoice' })
  @RequirePermission('sales_invoice.cancel')
  @Delete('sales-invoices/:id')
  deleteSalesInvoice(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.deleteSalesInvoice(id, user);
  }

  @ApiOperation({ summary: 'List Sales Invoices' })
  @RequirePermission('sales_invoice.view')
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @Get('sales-invoices')
  getSalesInvoices(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: any,
    @Query('paymentStatus') paymentStatus?: any,
  ) {
    return this.salesService.getSalesInvoices({ ...query, customerId, status, paymentStatus }, user);
  }

  @ApiOperation({ summary: 'Get Sales Invoice details by ID' })
  @RequirePermission('sales_invoice.view')
  @Get('sales-invoices/:id')
  getSalesInvoiceById(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.getSalesInvoiceById(id, user);
  }

  @ApiOperation({ summary: 'Download / View Puppeteer A4 PDF for Sales Invoice' })
  @RequirePermission('sales_invoice.view')
  @Get('sales-invoices/:id/pdf')
  async getSalesInvoicePdf(@Param('id') id: string, @GetUser() user: any, @Res() res: any) {
    const invoice = await this.salesService.getSalesInvoiceById(id, user);
    const pdfBuffer = await this.pdfService.generateInvoicePdf('SALES', invoice);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @ApiOperation({ summary: 'Post Sales Invoice (Atomic posting transaction)' })
  @RequirePermission('sales_invoice.post')
  @Post('sales-invoices/:id/post')
  postSalesInvoice(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.salesService.postSalesInvoice(id, user);
  }

  @ApiOperation({ summary: 'Cancel Sales Invoice' })
  @RequirePermission('sales_invoice.cancel')
  @Post('sales-invoices/:id/cancel')
  cancelSalesInvoice(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.salesService.cancelSalesInvoice(id, user);
  }

  // --- Sales Receipts ---
  @ApiOperation({ summary: 'Record Sales Receipt' })
  @RequirePermission('sales_receipt.create')
  @Post('sales-receipts')
  createSalesReceipt(
    @Body() dto: CreateSalesReceiptDto,
    @GetUser() user: any,
  ) {
    return this.salesService.createSalesReceipt(dto, user);
  }

  @ApiOperation({ summary: 'List Sales Receipts' })
  @RequirePermission('sales_receipt.create')
  @Get('sales-receipts')
  getSalesReceipts(@Query() query: PaginationQueryDto, @GetUser() user: any) {
    return this.salesService.getSalesReceipts(query, user);
  }

  @ApiOperation({ summary: 'Get Sales Receipt by ID' })
  @RequirePermission('sales_receipt.create')
  @Get('sales-receipts/:id')
  getSalesReceiptById(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.getSalesReceiptById(id, user);
  }

  @ApiOperation({ summary: 'Update Sales Receipt' })
  @RequirePermission('sales_receipt.create')
  @Patch('sales-receipts/:id')
  updateSalesReceipt(
    @Param('id') id: string,
    @Body() dto: UpdateSalesReceiptDto,
    @GetUser() user: any,
  ) {
    return this.salesService.updateSalesReceipt(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete Sales Receipt' })
  @RequirePermission('sales_receipt.create')
  @Delete('sales-receipts/:id')
  deleteSalesReceipt(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.deleteSalesReceipt(id, user);
  }

  @ApiOperation({ summary: 'Void / Reverse Sales Receipt' })
  @RequirePermission('sales_receipt.create')
  @Post('sales-receipts/:id/void')
  voidSalesReceipt(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.voidSalesReceipt(id, user);
  }

  @ApiOperation({ summary: 'Get receipts for a specific Sales Invoice' })
  @RequirePermission('sales_invoice.view')
  @Get('sales-invoices/:id/receipts')
  getInvoiceReceipts(@Param('id') salesInvoiceId: string, @GetUser() user: any) {
    return this.salesService.getInvoiceReceipts(salesInvoiceId, user);
  }
}
