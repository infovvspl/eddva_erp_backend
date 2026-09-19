import { Module } from '@nestjs/common';
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
import { CanteenAuthModule } from './auth/canteen-auth.module';
import { CanteenAuditService } from './common/canteen-audit.service';
import { CanteenRolesPermissionsModule } from './roles-permissions/canteen-roles-permissions.module';

@Module({
  imports: [CanteenAuthModule, CanteenRolesPermissionsModule],
  controllers: [
    CanteenMenuController,
    CanteenMembersController,
    CanteenPosController,
    CanteenOrdersController,
    CanteenPaymentsController,
    CanteenWalletController,
    CanteenReportsController,
  ],
  providers: [
    CanteenAuditService,
    CanteenMenuService,
    CanteenMembersService,
    CanteenPosService,
    CanteenOrdersService,
    CanteenPaymentsService,
    CanteenWalletService,
    CanteenReportsService,
  ],
  exports: [
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
