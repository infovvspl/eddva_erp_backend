import { Module } from '@nestjs/common';
import { CanteenRbacController } from './rbac/canteen-rbac.controller';
import { CanteenRbacService } from './rbac/canteen-rbac.service';
import { CanteenMenuController } from './menu/canteen-menu.controller';
import { CanteenMenuService } from './menu/canteen-menu.service';
import { CanteenMembersController } from './members/canteen-members.controller';
import { CanteenMembersService } from './members/canteen-members.service';
import { CanteenPosController } from './pos/canteen-pos.controller';
import { CanteenPosService } from './pos/canteen-pos.service';
import { CanteenOrdersController } from './orders/canteen-orders.controller';
import { CanteenOrdersService } from './orders/canteen-orders.service';
import { CanteenPaymentsController } from './payments/canteen-payments.controller';
import { CanteenPaymentsService } from './payments/canteen-payments.service';
import { CanteenWalletController } from './wallet/canteen-wallet.controller';
import { CanteenWalletService } from './wallet/canteen-wallet.service';
import { CanteenReportsController } from './reports/canteen-reports.controller';
import { CanteenReportsService } from './reports/canteen-reports.service';
import { CanteenPermissionsGuard } from './guards/canteen-permissions.guard';

@Module({
  controllers: [
    CanteenRbacController,
    CanteenMenuController,
    CanteenMembersController,
    CanteenPosController,
    CanteenOrdersController,
    CanteenPaymentsController,
    CanteenWalletController,
    CanteenReportsController,
  ],
  providers: [
    CanteenRbacService,
    CanteenMenuService,
    CanteenMembersService,
    CanteenPosService,
    CanteenOrdersService,
    CanteenPaymentsService,
    CanteenWalletService,
    CanteenReportsService,
    CanteenPermissionsGuard,
  ],
  exports: [
    CanteenRbacService,
    CanteenMenuService,
    CanteenMembersService,
    CanteenPosService,
    CanteenOrdersService,
    CanteenPaymentsService,
    CanteenWalletService,
    CanteenReportsService,
  ],
})
export class CanteenModule {}
