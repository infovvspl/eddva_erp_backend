import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { SalesPurchaseModule } from '../sales-purchase/sales-purchase.module';
import { CanteenModule } from '../canteen/canteen.module';
import { LibraryModule } from '../library/library.module';
import { SportsModule } from '../sports/sports.module';
import { TransportModule } from '../transport/transport.module';
import { FrontOfficeModule } from '../front-office/front-office.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AdmissionModule } from '../admission/admission.module';
import { HostelModule } from '../hostel/hostel.module';
import { AlumniModule } from '../alumni/alumni.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    AccountsModule,
    SalesPurchaseModule,
    CanteenModule,
    LibraryModule,
    SportsModule,
    TransportModule,
    FrontOfficeModule,
    InventoryModule,
    AdmissionModule,
    HostelModule,
    AlumniModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
