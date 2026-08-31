import { Module } from '@nestjs/common';
import { InventoryAuthModule } from './auth/inventory-auth.module';
import { InventoryRolesPermissionsModule } from './roles-permissions/inventory-roles-permissions.module';
import { InventoryAccessService } from './common/inventory-access.service';
import { InventoryAuditService } from './common/inventory-audit.service';
import { InventoryStockLedgerService } from './common/inventory-stock-ledger.service';

import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { VendorsController } from './vendors/vendors.controller';
import { VendorsService } from './vendors/vendors.service';
import { ItemsController } from './items/items.controller';
import { ItemsService } from './items/items.service';

import { StockController } from './stock/stock.controller';
import { PurchasesService } from './stock/purchases.service';
import { TransfersService } from './stock/transfers.service';
import { AdjustmentsService } from './stock/adjustments.service';
import { StockBalancesService } from './stock/stock-balances.service';

import { AssetUnitsController } from './assets/asset-units.controller';
import { AssetUnitsService } from './assets/asset-units.service';

import { IssuesController } from './issues/issues.controller';
import { IssuesService } from './issues/issues.service';
import { ApprovalRulesService } from './issues/approval-rules.service';

import { HoldersController } from './holders/holders.controller';
import { HoldersService } from './holders/holders.service';

import { MaintenanceController } from './maintenance/maintenance.controller';
import { MaintenanceService } from './maintenance/maintenance.service';

import { AlertsController } from './alerts/alerts.controller';
import { AlertsService } from './alerts/alerts.service';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

@Module({
  imports: [InventoryAuthModule, InventoryRolesPermissionsModule],
  controllers: [
    CategoriesController,
    LocationsController,
    VendorsController,
    ItemsController,
    StockController,
    AssetUnitsController,
    IssuesController,
    HoldersController,
    MaintenanceController,
    AlertsController,
    DashboardController,
  ],
  providers: [
    InventoryAccessService,
    InventoryAuditService,
    InventoryStockLedgerService,
    CategoriesService,
    LocationsService,
    VendorsService,
    ItemsService,
    PurchasesService,
    TransfersService,
    AdjustmentsService,
    StockBalancesService,
    AssetUnitsService,
    IssuesService,
    ApprovalRulesService,
    HoldersService,
    MaintenanceService,
    AlertsService,
    DashboardService,
  ],
})
export class InventoryModule {}
