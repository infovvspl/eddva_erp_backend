import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { PurchasesService } from './purchases.service';
import { TransfersService } from './transfers.service';
import { AdjustmentsService } from './adjustments.service';
import { StockBalancesService } from './stock-balances.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

@ApiTags('Inventory / Stock Register')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/stock')
export class StockController {
  constructor(
    private readonly purchasesService: PurchasesService,
    private readonly transfersService: TransfersService,
    private readonly adjustmentsService: AdjustmentsService,
    private readonly balancesService: StockBalancesService,
  ) {}

  // ─── Purchases ────────────────────────────────────────────────────────

  @Post('purchases')
  @RequirePermission({ resource: 'stock', action: 'purchase' })
  @ApiOperation({ summary: 'Receive a purchase — atomically creates the purchase record, a purchase_in ledger entry, and updates stock_balances (and asset units, for item_type=asset)' })
  createPurchase(@Body() dto: CreatePurchaseDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.purchasesService.create(dto, user.eddva_user_id);
  }

  @Get('purchases')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'List/filter purchases' })
  @ApiQuery({ name: 'vendor_id', required: false })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPurchases(
    @Query('vendor_id') vendorId?: string,
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchasesService.findAll({
      vendor_id: vendorId ? Number(vendorId) : undefined,
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('purchases/:id')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'Get a purchase, including any asset units created from it' })
  @ApiParam({ name: 'id', example: 1 })
  getPurchase(@Param('id', ParseIntPipe) id: number) {
    return this.purchasesService.findOne(id);
  }

  // ─── Transfers ────────────────────────────────────────────────────────

  @Post('transfers')
  @RequirePermission({ resource: 'stock', action: 'transfer' })
  @ApiOperation({ summary: 'Transfer stock between locations — atomically creates transfer_out + transfer_in ledger entries; rejects if source stock is insufficient' })
  createTransfer(@Body() dto: CreateTransferDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.transfersService.create(dto, user.eddva_user_id);
  }

  @Get('transfers')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'List/filter transfers' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false, description: 'Matches either from_location_id or to_location_id' })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listTransfers(
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transfersService.findAll({
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('transfers/:id')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'Get a transfer' })
  @ApiParam({ name: 'id', example: 1 })
  getTransfer(@Param('id', ParseIntPipe) id: number) {
    return this.transfersService.findOne(id);
  }

  // ─── Adjustments ──────────────────────────────────────────────────────

  @Post('adjustments')
  @RequirePermission({ resource: 'stock', action: 'adjust' })
  @ApiOperation({ summary: 'Record a stock adjustment (damaged/expired/lost/audit_correction) — creates an immutable ledger entry' })
  createAdjustment(@Body() dto: CreateAdjustmentDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.adjustmentsService.create(dto, user.eddva_user_id);
  }

  @Get('adjustments')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'List/filter adjustments' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'reason', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listAdjustments(
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('reason') reason?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adjustmentsService.findAll({
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      reason,
      date_from: dateFrom,
      date_to: dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('adjustments/:id')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'Get an adjustment' })
  @ApiParam({ name: 'id', example: 1 })
  getAdjustment(@Param('id', ParseIntPipe) id: number) {
    return this.adjustmentsService.findOne(id);
  }

  // ─── Balances / Ledger / Reconciliation ──────────────────────────────

  @Get('balances')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'Current stock balances (fast-lookup cache), filterable by item/location' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getBalances(
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.getBalances({
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('ledger')
  @RequirePermission({ resource: 'stock', action: 'read' })
  @ApiOperation({ summary: 'Append-only stock ledger — the source of truth for every quantity movement' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'transaction_type', required: false })
  @ApiQuery({ name: 'reference_type', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getLedger(
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('transaction_type') transactionType?: string,
    @Query('reference_type') referenceType?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.getLedger({
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      transaction_type: transactionType,
      reference_type: referenceType,
      date_from: dateFrom,
      date_to: dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('reconcile')
  @RequirePermission({ resource: 'stock', action: 'reconcile' })
  @ApiOperation({ summary: 'Recompute stock_balances from stock_ledger (the ledger always wins) — optionally scoped to one item' })
  @ApiQuery({ name: 'item_id', required: false })
  reconcile(@Query('item_id') itemId?: string) {
    return this.balancesService.reconcile(itemId ? Number(itemId) : undefined);
  }
}
