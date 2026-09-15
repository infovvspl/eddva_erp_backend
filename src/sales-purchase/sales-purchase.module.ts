import { Module } from '@nestjs/common';
import { SalesPurchaseAuthModule } from './auth/sales-purchase-auth.module';
import { SalesPurchaseRolesPermissionsModule } from './roles-permissions/sales-purchase-roles-permissions.module';
import { SalesPurchaseAccessService } from './common/sales-purchase-access.service';
import { SalesPurchaseAuditService } from './common/sales-purchase-audit.service';

import { ItemCategoriesController } from './masters/item-categories.controller';
import { ItemCategoriesService } from './masters/item-categories.service';
import { UomsController } from './masters/uoms.controller';
import { UomsService } from './masters/uoms.service';
import { TaxCodesController } from './masters/tax-codes.controller';
import { TaxCodesService } from './masters/tax-codes.service';
import { PaymentTermsController } from './masters/payment-terms.controller';
import { PaymentTermsService } from './masters/payment-terms.service';
import { WarehousesController } from './masters/warehouses.controller';
import { WarehousesService } from './masters/warehouses.service';

import { VendorsController } from './vendors/vendors.controller';
import { VendorContactsController } from './vendors/vendor-contacts.controller';
import { VendorBankDetailsController } from './vendors/vendor-bank-details.controller';
import { VendorsService } from './vendors/vendors.service';

import { CustomersController } from './customers/customers.controller';
import { CustomerContactsController } from './customers/customer-contacts.controller';
import { CustomersService } from './customers/customers.service';

import { ItemsController } from './items/items.controller';
import { ItemsService } from './items/items.service';

import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { ApprovalRulesController } from './purchase-orders/approval-rules.controller';
import { ApprovalRulesService } from './purchase-orders/approval-rules.service';

import { GrnsController } from './grns/grns.controller';
import { GrnsService } from './grns/grns.service';

import { PurchaseInvoicesController } from './purchase-invoices/purchase-invoices.controller';
import { PurchaseInvoicesService } from './purchase-invoices/purchase-invoices.service';
import { PurchaseInvoiceMatchService } from './purchase-invoices/purchase-invoice-match.service';

import { PurchasePaymentsController } from './purchase-payments/purchase-payments.controller';
import { PurchasePaymentsService } from './purchase-payments/purchase-payments.service';

import { SalesOrdersController } from './sales-orders/sales-orders.controller';
import { SalesOrdersService } from './sales-orders/sales-orders.service';

import { SalesInvoicesController } from './sales-invoices/sales-invoices.controller';
import { SalesInvoicesService } from './sales-invoices/sales-invoices.service';

import { SalesReceiptsController } from './sales-receipts/sales-receipts.controller';
import { SalesReceiptsService } from './sales-receipts/sales-receipts.service';

import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

@Module({
  imports: [SalesPurchaseAuthModule, SalesPurchaseRolesPermissionsModule],
  controllers: [
    ItemCategoriesController,
    UomsController,
    TaxCodesController,
    PaymentTermsController,
    WarehousesController,
    VendorsController,
    VendorContactsController,
    VendorBankDetailsController,
    CustomersController,
    CustomerContactsController,
    ItemsController,
    PurchaseOrdersController,
    ApprovalRulesController,
    GrnsController,
    PurchaseInvoicesController,
    PurchasePaymentsController,
    SalesOrdersController,
    SalesInvoicesController,
    SalesReceiptsController,
    ReportsController,
    DashboardController,
  ],
  providers: [
    SalesPurchaseAccessService,
    SalesPurchaseAuditService,
    ItemCategoriesService,
    UomsService,
    TaxCodesService,
    PaymentTermsService,
    WarehousesService,
    VendorsService,
    CustomersService,
    ItemsService,
    PurchaseOrdersService,
    ApprovalRulesService,
    GrnsService,
    PurchaseInvoicesService,
    PurchaseInvoiceMatchService,
    PurchasePaymentsService,
    SalesOrdersService,
    SalesInvoicesService,
    SalesReceiptsService,
    ReportsService,
    DashboardService,
  ],
})
export class SalesPurchaseModule {}
